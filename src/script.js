document.addEventListener('DOMContentLoaded', () => {
    // --- Config ---
    const JSON_FILE = 'resultado_duplicates.json';
    // --- Ajuste o path que voce quer omitir do relatorio visual ---
    const ROOT_PREFIX_TO_STRIP = '/caminho/a/omitir';

    // --- DOM Elements ---
    const dom = {
        tabs: document.querySelectorAll('.tab-button'),
        tabPanes: document.querySelectorAll('.tab-pane'),
        sortBy: document.getElementById('sort-by'),
        itemsPerPage: document.getElementById('items-per-page'),
        btnPrev: document.getElementById('prev-page'),
        btnNext: document.getElementById('next-page'),
        pageInfo: document.getElementById('page-info'),
        btnGenerate: document.getElementById('generate-txt'),
        fileInput: document.getElementById('load-txt-file'),
        containers: {
            duplicates: document.getElementById('duplicate-groups-container'),
            emptydirs: document.getElementById('emptydirs-list-container'),
            emptyfiles: document.getElementById('emptyfiles-list-container')
        },
        // Status Bar Elements
        globalCount: document.getElementById('global-count'),
        globalSize: document.getElementById('global-size'),
        selectedCount: document.getElementById('selected-count'),
        selectedSize: document.getElementById('selected-size'),
        stickyWrapper: document.getElementById('sticky-wrapper')
    };

    // --- State ---
    const state = {
        data: {
            duplicates: [],
            emptydirs: [],
            emptyfiles: []
        },
        sizeMap: new Map(), 
        currentTab: 'duplicates',
        pagination: { duplicates: 1, emptydirs: 1, emptyfiles: 1 },
        itemsPerPage: 25,
        filesToDelete: new Set(),
        currentTotalBytes: 0,
        // Global Stats (Detected)
        totalRedundantCount: 0,
        totalRedundantSize: 0
    };

    // --- Init ---
    init();

    function init() {
        setupEventListeners();
        loadData();
    }

    // --- Data Loading ---
    async function loadData() {
        try {
            const response = await fetch(JSON_FILE);
            if (!response.ok) throw new Error(response.statusText);
            const rawData = await response.json();
            processData(rawData);
            updateSortOptions();
            renderCurrentTab();
            updateGlobalStatsUI();
        } catch (error) {
            console.error(error);
            const msg = `<div style="text-align:center; padding:20px; color:var(--red)">
                Erro ao carregar <b>${JSON_FILE}</b>.<br>Verifique o servidor web.
            </div>`;
            Object.values(dom.containers).forEach(el => el.innerHTML = msg);
        }
    }

    function processData(rawData) {
        const dupMap = new Map();

        rawData.forEach(item => {
            if (item.path) {
                state.sizeMap.set(item.path, item.size || 0);
            }

            if (item.type === 'duplicate_file') {
                if (!dupMap.has(item.checksum)) {
                    dupMap.set(item.checksum, {
                        checksum: item.checksum,
                        size: item.size,
                        files: []
                    });
                }
                dupMap.get(item.checksum).files.push({
                    path: item.path,
                    is_original: item.is_original
                });
            } else if (item.type === 'emptydir') {
                state.data.emptydirs.push(item);
            } else if (item.type === 'emptyfile') {
                state.data.emptyfiles.push(item);
            }
        });

        state.data.duplicates = Array.from(dupMap.values());

        // Calculate Global Redundancy Stats
        state.data.duplicates.forEach(group => {
            // Redundancy = Total files in group minus 1 (the one we keep)
            const redundantCount = group.files.length - 1;
            if (redundantCount > 0) {
                state.totalRedundantCount += redundantCount;
                state.totalRedundantSize += (group.size * redundantCount);
            }
        });
    }

    // --- Render Logic ---
    function renderCurrentTab() {
        const tab = state.currentTab;
        const container = dom.containers[tab];
        container.innerHTML = '';

        const sortedData = getSortedData(tab);
        const totalItems = sortedData.length;

        if (totalItems === 0) {
            container.innerHTML = '<p>Nada encontrado.</p>';
            updatePaginationUI(0);
            return;
        }

        const page = state.pagination[tab];
        const limit = state.itemsPerPage;
        const start = (page - 1) * limit;
        const end = start + limit;
        const pageData = sortedData.slice(start, end);

        if (tab === 'duplicates') {
            renderDuplicates(pageData, container);
        } else {
            renderSimpleList(pageData, container, tab);
        }

        updatePaginationUI(totalItems);
        // Scroll to top of Main (minus header offset)
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function renderDuplicates(groups, container) {
        groups.forEach((group) => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'group-container';
            const saved = group.size * (group.files.length - 1);

            const header = document.createElement('div');
            header.className = 'group-header';
            header.innerHTML = `
                <div class="group-info">
                    <span>Tam: <strong>${formatBytes(group.size)}</strong></span>
                    <span>Cópias: <strong>${group.files.length}</strong></span>
                    <span class="recoverable">Recuperável: <strong>${formatBytes(saved)}</strong></span>
                </div>
                <span class="toggle-icon">+</span>
            `;

            const content = document.createElement('div');
            content.className = 'group-content';
            
            group.files.forEach(file => {
                const row = createCheckableRow(file.path, file.is_original);
                content.appendChild(row);
            });

            groupDiv.append(header, content);
            container.appendChild(groupDiv);

            header.addEventListener('click', () => {
                const isExpanded = content.classList.toggle('expanded');
                header.querySelector('.toggle-icon').textContent = isExpanded ? '-' : '+';
            });
        });
    }

    function renderSimpleList(items, container) {
        items.forEach(item => {
            const row = createCheckableRow(item.path, false);
            container.appendChild(row);
        });
    }

    function createCheckableRow(fullPath, isOriginal) {
        const div = document.createElement('div');
        div.className = 'file-item';
        
        const id = btoa(unescape(encodeURIComponent(fullPath))).replace(/=/g, '');
        const isChecked = state.filesToDelete.has(fullPath);
        const displayPath = fullPath.startsWith(ROOT_PREFIX_TO_STRIP) 
            ? fullPath.substring(ROOT_PREFIX_TO_STRIP.length) 
            : fullPath;

        div.innerHTML = `
            <input type="checkbox" id="${id}" ${isChecked ? 'checked' : ''}>
            <label for="${id}" title="${fullPath}">
                ${displayPath}
                ${isOriginal ? '<span class="original-tag">(Original)</span>' : ''}
            </label>
        `;

        const chk = div.querySelector('input');
        div.setAttribute('data-path-b64', id);

        chk.addEventListener('change', (e) => {
            toggleFileSelection(fullPath, e.target.checked);
        });

        return div;
    }

    // --- Logic: Selection & Totals ---
    function toggleFileSelection(path, isSelected) {
        const size = state.sizeMap.get(path) || 0;

        if (isSelected) {
            if (!state.filesToDelete.has(path)) {
                state.filesToDelete.add(path);
                state.currentTotalBytes += size;
            }
        } else {
            if (state.filesToDelete.has(path)) {
                state.filesToDelete.delete(path);
                state.currentTotalBytes -= size;
            }
        }
        updateStickyFooter();
    }

    function updateGlobalStatsUI() {
        dom.globalCount.textContent = state.totalRedundantCount;
        dom.globalSize.textContent = formatBytes(state.totalRedundantSize);
    }

    function updateStickyFooter() {
        dom.selectedCount.textContent = state.filesToDelete.size;
        dom.selectedSize.textContent = formatBytes(state.currentTotalBytes);
    }

    // --- Logic: Restore State ---
    function handleFileLoad(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            const lines = e.target.result.split('\n');
            let restoredCount = 0;
            let lastMatchedPath = null;

            lines.forEach(line => {
                const path = line.trim();
                if (path && state.sizeMap.has(path)) {
                    if (!state.filesToDelete.has(path)) {
                        state.filesToDelete.add(path);
                        state.currentTotalBytes += state.sizeMap.get(path);
                        restoredCount++;
                    }
                    lastMatchedPath = path; 
                }
            });

            updateStickyFooter();
            
            if (lastMatchedPath) {
                alert(`${restoredCount} novos itens marcados. Navegando para o ÚLTIMO item.`);
                navigateToItem(lastMatchedPath);
            } else {
                alert("Nenhum item válido encontrado.");
            }
            dom.fileInput.value = '';
        };
        reader.readAsText(file);
    }

    function navigateToItem(targetPath) {
        const tabsToCheck = ['duplicates', 'emptydirs', 'emptyfiles'];
        let foundTab = null;
        let foundIndex = -1;

        for (const tab of tabsToCheck) {
            const sortedData = getSortedData(tab);
            
            if (tab === 'duplicates') {
                for (let i = 0; i < sortedData.length; i++) {
                    const group = sortedData[i];
                    if (group.files.some(f => f.path === targetPath)) {
                        foundTab = tab;
                        foundIndex = i;
                        break;
                    }
                }
            } else {
                foundIndex = sortedData.findIndex(item => item.path === targetPath);
                if (foundIndex !== -1) foundTab = tab;
            }
            if (foundTab) break;
        }

        if (foundTab) {
            if (state.currentTab !== foundTab) switchTab(foundTab);

            const page = Math.ceil((foundIndex + 1) / state.itemsPerPage);
            state.pagination[foundTab] = page;
            renderCurrentTab();

            setTimeout(() => {
                const id = btoa(unescape(encodeURIComponent(targetPath))).replace(/=/g, '');
                const chk = document.getElementById(id);
                if (chk) {
                    const row = chk.closest('.file-item, .dir-item, .emptyfile-item');
                    const groupContent = row.closest('.group-content');
                    if (groupContent) {
                        groupContent.classList.add('expanded');
                        // Fix toggle icon if expanded programmatically
                        const groupContainer = groupContent.parentElement;
                        const headerToggle = groupContainer.querySelector('.toggle-icon');
                        if (headerToggle) headerToggle.textContent = '-';
                    }
                    
                    // Scroll Calculation accounting for Sticky Header
                    const headerOffset = dom.stickyWrapper.offsetHeight + 20;
                    const elementPosition = row.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                    window.scrollTo({
                        top: offsetPosition,
                        behavior: "smooth"
                    });

                    row.classList.add('highlight-row');
                    setTimeout(() => row.classList.remove('highlight-row'), 2000);
                }
            }, 100);
        }
    }

    // --- Sorting & Pagination ---
    function getSortedData(tab) {
        const list = [...state.data[tab]];
        const mode = dom.sortBy.value;

        return list.sort((a, b) => {
            if (tab === 'duplicates') {
                if (mode === 'size-desc') return b.size - a.size;
                if (mode === 'size-asc') return a.size - b.size;
                return a.files[0].path.localeCompare(b.files[0].path);
            } 
            return a.path.localeCompare(b.path);
        });
    }

    function updateSortOptions() {
        dom.sortBy.innerHTML = '';
        const tab = state.currentTab;
        if (tab === 'duplicates') {
            dom.sortBy.add(new Option('Tamanho (Maior)', 'size-desc'));
            dom.sortBy.add(new Option('Tamanho (Menor)', 'size-asc'));
        }
        dom.sortBy.add(new Option('Caminho (A-Z)', 'path-asc'));
    }

    function updatePaginationUI(total) {
        const page = state.pagination[state.currentTab];
        const pages = Math.ceil(total / state.itemsPerPage);
        dom.pageInfo.textContent = `${page} / ${pages}`;
        dom.btnPrev.disabled = page <= 1;
        dom.btnNext.disabled = page >= pages;
    }

    function changePage(dir) {
        const tab = state.currentTab;
        const sortedData = getSortedData(tab);
        const pages = Math.ceil(sortedData.length / state.itemsPerPage);
        const newPage = state.pagination[tab] + dir;

        if (newPage > 0 && newPage <= pages) {
            state.pagination[tab] = newPage;
            renderCurrentTab();
        }
    }

    // --- Tabs & Switch ---
    function switchTab(tabId) {
        state.currentTab = tabId;
        
        // Remove active from all tabs/panes
        dom.tabs.forEach(btn => btn.classList.remove('active'));
        dom.tabPanes.forEach(pane => pane.classList.remove('active'));

        // Add active to current
        const currentBtn = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
        const currentPane = document.getElementById(`${tabId}-tab`);
        
        if (currentBtn) currentBtn.classList.add('active');
        if (currentPane) currentPane.classList.add('active');

        updateSortOptions();
        renderCurrentTab();
    }

    // --- Helpers ---
    function setupEventListeners() {
        dom.tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
        
        dom.sortBy.addEventListener('change', () => {
            state.pagination[state.currentTab] = 1;
            renderCurrentTab();
        });

        dom.itemsPerPage.addEventListener('change', (e) => {
            state.itemsPerPage = parseInt(e.target.value);
            state.pagination[state.currentTab] = 1;
            renderCurrentTab();
        });

        dom.btnPrev.addEventListener('click', () => changePage(-1));
        dom.btnNext.addEventListener('click', () => changePage(1));

        dom.btnGenerate.addEventListener('click', () => {
            if (state.filesToDelete.size === 0) return alert('Nada marcado.');
            const content = Array.from(state.filesToDelete).join('\n');
            const blob = new Blob([content], {type: 'text/plain;charset=utf-8'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'remocao_files.txt';
            a.click();
            URL.revokeObjectURL(url);
        });

        dom.fileInput.addEventListener('change', handleFileLoad);
    }

    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }
});
