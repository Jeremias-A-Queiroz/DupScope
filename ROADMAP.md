# Project Roadmap

This document outlines the planned features, improvements, and future direction for **DupScope**.

## 🎨 UI/UX Improvements

- [ ] **Light Theme Support**
  - [ ] Create a light theme variation based on the **Solarized Light** color palette.
  - [ ] Implement auto-detection of the user's system preference (using `prefers-color-scheme`).
  - [ ] Add a manual toggle button in the interface to switch between Dark and Light modes.

## 🌐 Internationalization (i18n)

- [ ] **English Version**
  - [ ] **Strategy:** Implement Client-Side Substitution via Data Attributes (`data-i18n`) to maintain a serverless architecture.
  - [ ] **Implementation Plan:**
    1.  **HTML Refactoring:** Replace hardcoded text with unique keys.
        *   *Before:* `<h1>Auditoria de Armazenamento</h1>`
        *   *After:* `<h1 data-i18n="header.title">Auditoria de Armazenamento</h1>`
    2.  **Translation Dictionary:** Create a centralized JavaScript object/JSON containing strings for `pt-BR` (default) and `en-US`.
        *   *Example Structure:*
            ```javascript
            const i18n = {
                'pt-BR': {
                    'header.title': 'Auditoria de Armazenamento',
                    'alerts.no_selection': 'Nenhum arquivo selecionado.'
                },
                'en-US': {
                    'header.title': 'Storage Audit',
                    'alerts.no_selection': 'No files selected.'
                }
            };
            ```
    3.  **Translation Engine:** Implement a lightweight JS function to:
        *   Detect user language (`navigator.language`).
        *   Iterate over all elements with `data-i18n` attributes and update `textContent`.
        *   Provide a helper function (e.g., `t('key')`) for dynamic strings inside JavaScript logic (alerts, logs).
