using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using System.Windows.Forms;

namespace NivoDockInstaller
{
    public class InstallerForm : Form
    {
        private TextBox txtInstallDir;
        private CheckBox chkDesktopShortcut;
        private CheckBox chkAutoStart;
        private Button btnInstall;
        private Label lblStatus;

        public InstallerForm()
        {
            this.Text = "Instalador — NivoDock";
            this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            this.Size = new Size(540, 340);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(24, 24, 27);
            this.ForeColor = Color.White;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            Label lblTitle = new Label
            {
                Text = "NivoDock — Instalação",
                Font = new Font("Segoe UI", 15f, FontStyle.Bold),
                ForeColor = Color.FromArgb(244, 244, 245),
                Location = new Point(24, 20),
                AutoSize = true
            };

            Label lblSub = new Label
            {
                Text = "Seus jogos. Um só lugar.",
                ForeColor = Color.FromArgb(161, 161, 170),
                Location = new Point(26, 54),
                AutoSize = true
            };

            Label lblDir = new Label
            {
                Text = "Pasta de instalação:",
                Location = new Point(26, 95),
                AutoSize = true
            };

            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string defaultDir = Path.Combine(localAppData, "NivoDock");
            txtInstallDir = new TextBox
            {
                Text = defaultDir,
                Location = new Point(26, 120),
                Width = 370,
                BackColor = Color.FromArgb(32, 32, 35),
                ForeColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle
            };

            Button btnBrowse = new Button
            {
                Text = "Procurar...",
                Location = new Point(406, 118),
                Width = 95,
                Height = 27,
                BackColor = Color.FromArgb(48, 48, 52),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            btnBrowse.Click += (s, e) =>
            {
                using (FolderBrowserDialog fbd = new FolderBrowserDialog())
                {
                    if (fbd.ShowDialog() == DialogResult.OK)
                    {
                        txtInstallDir.Text = fbd.SelectedPath;
                    }
                }
            };

            chkDesktopShortcut = new CheckBox
            {
                Text = "Criar atalho na Área de Trabalho e no Menu Iniciar",
                Checked = true,
                Location = new Point(26, 162),
                AutoSize = true
            };

            chkAutoStart = new CheckBox
            {
                Text = "Iniciar NivoDock junto com o Windows",
                Checked = true,
                Location = new Point(26, 192),
                AutoSize = true
            };

            lblStatus = new Label
            {
                Text = "",
                ForeColor = Color.FromArgb(212, 212, 216),
                Location = new Point(26, 238),
                AutoSize = true
            };

            btnInstall = new Button
            {
                Text = "Instalar e Abrir Launcher",
                Font = new Font("Segoe UI", 10f, FontStyle.Bold),
                Location = new Point(280, 232),
                Width = 220,
                Height = 42,
                BackColor = Color.FromArgb(105, 87, 219),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            btnInstall.Click += OnInstallClick;

            this.Controls.Add(lblTitle);
            this.Controls.Add(lblSub);
            this.Controls.Add(lblDir);
            this.Controls.Add(txtInstallDir);
            this.Controls.Add(btnBrowse);
            this.Controls.Add(chkDesktopShortcut);
            this.Controls.Add(chkAutoStart);
            this.Controls.Add(lblStatus);
            this.Controls.Add(btnInstall);
        }

        private void OnInstallClick(object sender, EventArgs e)
        {
            try
            {
                btnInstall.Enabled = false;
                lblStatus.Text = "Instalando arquivos...";
                Application.DoEvents();

                string srcDir = AppDomain.CurrentDomain.BaseDirectory;
                string dstDir = txtInstallDir.Text.Trim();

                if (!Directory.Exists(dstDir))
                {
                    Directory.CreateDirectory(dstDir);
                }

                string sourceFull = Path.GetFullPath(srcDir).TrimEnd(Path.DirectorySeparatorChar);
                string destinationFull = Path.GetFullPath(dstDir).TrimEnd(Path.DirectorySeparatorChar);
                if (destinationFull.StartsWith(sourceFull + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("Escolha uma pasta fora do pacote de instalacao.");
                if (!sourceFull.Equals(destinationFull, StringComparison.OrdinalIgnoreCase)) CopyDirectory(srcDir, dstDir);

                string targetExe = Path.Combine(dstDir, "NivoDock.exe");

                if (chkDesktopShortcut.Checked)
                {
                    string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                    CreateShortcut(Path.Combine(desktop, "NivoDock.lnk"), targetExe, dstDir);

                    string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                    CreateShortcut(Path.Combine(startMenu, "NivoDock.lnk"), targetExe, dstDir);
                }

                if (chkAutoStart.Checked)
                {
                    string startup = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
                    foreach (string name in new[] { "NivoDock.bat", "NivoDock.lnk" })
                    {
                        string previous = Path.Combine(startup, name);
                        if (File.Exists(previous)) File.Delete(previous);
                    }
                    File.WriteAllText(Path.Combine(startup, "NivoDock.bat"), "@echo off\r\nchcp 65001 >nul\r\nstart \"\" \"" + targetExe + "\"\r\n", new UTF8Encoding(false));
                }

                lblStatus.Text = "Instalação concluída!";
                Process.Start(new ProcessStartInfo
                {
                    FileName = targetExe,
                    WorkingDirectory = dstDir,
                    UseShellExecute = true
                });

                this.Close();
            }
            catch (Exception ex)
            {
                MessageBox.Show("Erro durante a instalação: " + ex.Message, "Erro", MessageBoxButtons.OK, MessageBoxIcon.Error);
                btnInstall.Enabled = true;
            }
        }

        private static void CopyDirectory(string sourceDir, string destinationDir)
        {
            Directory.CreateDirectory(destinationDir);
            foreach (string file in Directory.GetFiles(sourceDir))
            {
                string name = Path.GetFileName(file);
                if (name.Equals("Instalar-NivoDock.exe", StringComparison.OrdinalIgnoreCase)) continue;
                if (name.Equals("games.json", StringComparison.OrdinalIgnoreCase) || name.Equals("config.json", StringComparison.OrdinalIgnoreCase) || name.EndsWith(".log", StringComparison.OrdinalIgnoreCase)) continue;
                File.Copy(file, Path.Combine(destinationDir, name), true);
            }
            foreach (string subDir in Directory.GetDirectories(sourceDir))
            {
                string name = Path.GetFileName(subDir);
                if (name.StartsWith(".") || name.Equals("backups", StringComparison.OrdinalIgnoreCase) || name.Equals("dist", StringComparison.OrdinalIgnoreCase) || name.Equals("node_modules", StringComparison.OrdinalIgnoreCase)) continue;
                CopyDirectory(subDir, Path.Combine(destinationDir, name));
            }
        }

        private static void CreateShortcut(string shortcutPath, string targetPath, string workingDir)
        {
            IShellLink link = (IShellLink)new ShellLink();
            link.SetDescription("NivoDock — Seus jogos. Um só lugar.");
            link.SetPath(targetPath);
            link.SetWorkingDirectory(workingDir);
            link.SetIconLocation(targetPath, 0);
            IPersistFile file = (IPersistFile)link;
            file.Save(shortcutPath, false);
        }

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
        }
    }

    [ComImport]
    [Guid("00021401-0000-0000-C000-000000000046")]
    internal class ShellLink { }

    [ComImport]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    [Guid("000214F9-0000-0000-C000-000000000046")]
    internal interface IShellLink
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, out IntPtr pfd, int fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cchMaxName);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cchMaxPath);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cchMaxPath);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cchIconPath, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, int dwReserved);
        void Resolve(IntPtr hwnd, int fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }
}
