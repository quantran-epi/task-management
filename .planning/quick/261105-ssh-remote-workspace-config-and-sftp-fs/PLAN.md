# Quick Task: Remote SSH Configuration and SFTP Filesystem Backend

## Goal
Implement multi-profile SSH connection configuration with secure credential handling and a full-featured SFTP/SSH file system backend in Tauri/Rust for remote workspace operations.

## Architecture
1. **Rust Backend (`src-tauri/src/ssh_service.rs`)**:
   - Uses `ssh2` crate for SSH transport and SFTP subsystem.
   - Supports Password, Private Key (with passphrase), and SSH Agent authentication.
   - Exposes Tauri commands:
     - `ssh_test_connection`
     - `ssh_list_dir`
     - `ssh_read_file`
     - `ssh_write_file`
     - `ssh_create_dir`
     - `ssh_delete_entry`
     - `ssh_rename`
     - `ssh_exec_command`
2. **Frontend Service & Types (`src/types/ssh.ts`, `src/services/sshService.ts`)**:
   - `SshConfig` model with ID, name, host, port, username, auth_type, key_path, default_remote_path.
   - Persistence in `db.settings` under `'ssh_configurations'`.
   - Sensitive credentials (passwords, key passphrases) stored in native OS Keyring via `keyringService`.
   - Typed client wrappers for all Tauri backend SFTP/SSH commands.
3. **Settings UI (`src/components/settings/SshConfigCard.tsx`)**:
   - Management table/list of multiple named SSH configurations.
   - Add/Edit modal with Host, Port, User, Auth type (Password / Private Key / Agent), File Picker for private key, password/passphrase input, and default remote path.
   - "Kiểm tra kết nối" (Test Connection) with live latency and OS/banner info.
   - Added as "Remote SSH" tab in `SettingsView.tsx`.
