# DupScope

**DupScope** is a static, responsive web interface for auditing `rmlint` JSON reports. It features advanced filtering, sorting, pagination, and persistent state management, allowing System Administrators to safely identify and generate batch removal scripts for deduplication tasks.

![License](https://img.shields.io/badge/license-GPLv3-blue.svg)
![rmlint](https://img.shields.io/badge/rmlint-v2.9.0%2B-green)

## 📋 Features

*   **Zero Backend:** Runs entirely in the browser using HTML/CSS/JS. No PHP, Python, or Database required at runtime.
*   **Solarized Dark Theme:** High-density, eye-friendly design for long auditing sessions.
*   **Smart Filtering:**
    *   Grouped view for Duplicate Files (with potential space savings).
    *   Dedicated views for Empty Directories and Empty Files.
*   **State Persistence:** Save your work (files marked for deletion) to a text file and resume later exactly where you left off.
*   **Safe Batching:** Generates a clean Bash-friendly list of absolute paths for removal.
*   **Granular Permissions:** Supports serving different datasets to different users via Apache `.htaccess` (see Advanced Configuration).

## 🛠️ Prerequisites

To generate the reports and prepare the environment, you need:

1.  **rmlint (≥ 2.9.0):** The engine used to find the duplicates.
2.  **jq (Optional):** Highly recommended for minifying (compacting) large JSON reports or splitting them for permissions.
3.  **Web Server:** Any server capable of serving static files (Apache is required for the Granular Permissions feature).

## 🚀 Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/YOUR_USERNAME/DupScope.git
    cd DupScope
    ```

2.  Copy the contents of the `src/` folder to your web server's public directory:
    ```bash
    cp -r src/* /var/www/html/auditoria/
    ```

## ⚙️ Configuration

### 1. Adjusting Path Visualization
By default, the interface displays file paths relative to the root. You should configure the prefix stripping to match your scanned directory.

Edit =script.js= (line 4):

```javascript
// CONFIG: Change this to match the root folder scanned by rmlint
const ROOT_PREFIX_TO_STRIP = '/mnt/storage_data';
```

## 📊 Generating the Report (Step-by-Step)

The core of DupScope is the `resultado_duplicates.json` file. Since `rmlint` scans can be heavy, we use a specific strategy to **exclude specific folders (like Recycle Bins)** without using the slow `find` command.

### 1. The Scanning Command

Assuming you want to scan `/mnt/storage_data` but **exclude** the `.recycle_bin` folder located at the root level:

```bash
nohup bash -c '
  shopt -s nullglob
  # 1. Define the root directory
  target_dir="/mnt/storage_data"
  dirs=("$target_dir"/*)
  filtered_dirs=()

  # 2. Filter out the unwanted directory (e.g., .recycle_bin)
  for dir in "${dirs[@]}"; do
    if [[ "$dir" != "$target_dir/.recycle_bin" ]]; then
      filtered_dirs+=("$dir")
    fi
  done

  # 3. Run rmlint on the filtered list
  rmlint -o json "${filtered_dirs[@]}" > resultado_duplicates.json
' &
```

*Note: This command runs in the background (`nohup ... &`). You can close your terminal while it runs.*

### 2. Optimization for Large Datasets (Optional)

By default, `rmlint` generates "pretty-printed" JSON (with indentation and newlines). For massive datasets (hundreds of thousands of files), this can result in extremely large files that load slowly in the browser.

To optimize, use `jq` to minify (compact) the file into a one-liner:

```bash
# Reduces file size by ~20-30% and speeds up browser parsing
mv resultado_duplicates.json raw.json
jq -c . raw.json > resultado_duplicates.json
rm raw.json
```

Once finished, move the final `resultado_duplicates.json` to your web server folder.

## 🔐 Advanced: Granular Permissions (ACLs)

Since DupScope is a static site, the browser downloads the JSON file. To prevent unauthorized users (e.g., "Interns") from seeing sensitive data (e.g., "Finance Folder"), we use **Apache Rewrite Rules** to serve different JSON files based on the logged-in user.

### Step 1: Create User Credentials

Use `htpasswd` to create users. We recommend storing the file outside the public web root.

```bash
# Create the file and the first user (Admin)
htpasswd -c /etc/apache2/.htpasswd admin_user

# Add specific department users
htpasswd /etc/apache2/.htpasswd finance_user
htpasswd /etc/apache2/.htpasswd factory_user
```

### Step 2: Split the JSON Report

Use `jq` to filter the master report into specific files for each user. We use the `-c` flag here to ensure the resulting files are compact.

**Scenario:**
*   **admin_user:** Sees everything.
*   **finance_user:** Sees only files inside `/mnt/storage_data/Finance` and `/mnt/storage_data/Admin`.
*   **factory_user:** Sees only files inside `/mnt/storage_data/Factory`.

Run these commands (automate this in your cron job):

```bash
# 1. Admin gets the full master file (Symbolic link or copy)
cp resultado_duplicates.json data_admin.json

# 2. Generate Finance JSON
# We keep metadata (type != duplicate_file) OR matching paths
jq -c '[.[] | select(
    (.type != "duplicate_file") or 
    (.path | startswith("/mnt/storage_data/Finance")) or 
    (.path | startswith("/mnt/storage_data/Admin"))
)]' resultado_duplicates.json > data_finance.json

# 3. Generate Factory JSON
jq -c '[.[] | select(
    (.type != "duplicate_file") or 
    (.path | startswith("/mnt/storage_data/Factory"))
)]' resultado_duplicates.json > data_factory.json
```

### Step 3: Configure Apache (.htaccess)

Edit the `.htaccess` file provided in the `src/` directory to map users to their specific JSON files.

```apache
AuthType Basic
AuthName "Restricted Audit Area"
AuthUserFile /etc/apache2/.htpasswd
Require valid-user

<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /

    # Logic: The frontend requests 'resultado_duplicates.json'.
    # Apache checks who is logged in (REMOTE_USER) and serves the specific file silently.

    # 1. Finance User
    RewriteCond %{REMOTE_USER} ^finance_user$
    RewriteRule ^resultado_duplicates\.json$ data_finance.json [L]

    # 2. Factory User
    RewriteCond %{REMOTE_USER} ^factory_user$
    RewriteRule ^resultado_duplicates\.json$ data_factory.json [L]

    # 3. Admin (or default fallback)
    RewriteCond %{REMOTE_USER} ^admin_user$
    RewriteRule ^resultado_duplicates\.json$ data_admin.json [L]
</IfModule>
```

**Result:** When `finance_user` logs in, the JavaScript loads `resultado_duplicates.json`, but Apache actually sends the content of `data_finance.json`. The user never sees files outside their permission scope.

## 🗑️ Removing Files

1.  Use the DupScope interface to mark files for deletion.
2.  Click **"Baixar Lista TXT"** to download `remocao_files.txt`.
3.  Transfer this file to your server.
4.  **Review the list carefully.**
5.  Execute the removal using `xargs`:

```bash
# Dry-run (Check what will be deleted)
cat remocao_files.txt | xargs -I {} echo "Would delete: {}"

# ACTUAL DELETION (Use with caution!)
cat remocao_files.txt | tr '\n' '\0' | xargs -0 rm
```

## 📄 License

This project is licensed under the GNU General Public License v3.0 - see the LICENSE file for details.
