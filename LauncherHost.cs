using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

namespace NivoDock
{
    static class Program
    {
        private static Process serverProcess = null;

        [STAThread]
        static void Main(string[] args)
        {
            try
            {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string serverJs = Path.Combine(baseDir, "server.js");

            RecoverInterruptedUpdate(baseDir);

            if (!IsPortOpen("127.0.0.1", 47890))
            {
                string nodeExe = FindNodeExecutable(baseDir);
                if (!string.IsNullOrEmpty(nodeExe) && File.Exists(serverJs))
                {
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = nodeExe,
                        Arguments = "\"" + serverJs + "\"",
                        WorkingDirectory = baseDir,
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };
                    serverProcess = Process.Start(psi);
                    for (int attempt = 0; attempt < 50; attempt++)
                    {
                        if (IsPortOpen("127.0.0.1", 47890)) break;
                        if (serverProcess.HasExited) throw new Exception("O servidor do NivoDock encerrou antes de iniciar.");
                        Thread.Sleep(100);
                    }
                    if (!IsPortOpen("127.0.0.1", 47890)) throw new Exception("O NivoDock nao respondeu ao iniciar.");
                }
            }

            // Open native app window (Edge App Mode with isolated profile or default browser)
            string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
            if (!File.Exists(edgePath))
            {
                edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
            }

            if (File.Exists(edgePath))
            {
                string profileDir = Path.Combine(baseDir, ".deck-profile");
                ProcessStartInfo uiPsi = new ProcessStartInfo
                {
                    FileName = edgePath,
                    Arguments = "--app=http://127.0.0.1:47890 --start-maximized --user-data-dir=\"" + profileDir + "\"",
                    UseShellExecute = true
                };
                Process.Start(uiPsi);
            }
            else
            {
                Process.Start("http://127.0.0.1:47890");
            }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Nao foi possivel abrir o NivoDock. Use o pacote standalone completo.\n\n" + ex.Message, "NivoDock", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void RecoverInterruptedUpdate(string baseDir)
        {
            string state = Path.Combine(baseDir, ".updates");
            if (!File.Exists(Path.Combine(state, "transaction.json"))) return;
            string runtime = Path.Combine(state, @"worker\node.exe");
            string worker = Path.Combine(state, @"worker\update-worker.js");
            if (!File.Exists(runtime) || !File.Exists(worker))
                throw new Exception("A recuperacao da atualizacao precisa dos arquivos de .updates. Preserve essa pasta e reinstale o pacote completo, mantendo seus dados.");
            ProcessStartInfo recovery = new ProcessStartInfo
            {
                FileName = runtime,
                Arguments = "\"" + worker + "\" --recover \"" + baseDir.TrimEnd(Path.DirectorySeparatorChar) + "\"",
                WorkingDirectory = baseDir,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using (Process process = Process.Start(recovery))
            {
                if (!process.WaitForExit(90000)) throw new Exception("Uma atualizacao ainda esta em andamento. Aguarde e abra novamente.");
                if (process.ExitCode != 0) throw new Exception("Nao foi possivel concluir a recuperacao. Feche o NivoDock e abra novamente. Seus dados foram preservados.");
            }
        }

        private static string FindNodeExecutable(string baseDir)
        {
            string bundled = Path.Combine(baseDir, "node.exe");
            if (File.Exists(bundled)) return bundled;

            string progFiles = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
            if (File.Exists(progFiles)) return progFiles;

            return "node.exe";
        }

        private static bool IsPortOpen(string host, int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    var result = client.BeginConnect(host, port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(250));
                    if (!success) return false;
                    client.EndConnect(result);
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }
    }
}
