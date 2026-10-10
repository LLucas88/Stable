using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Drawing;
using Microsoft.Win32;

class Profile { public string providerId { get; set; } public string displayName { get; set; } public string baseURL { get; set; } public string model { get; set; } }
class Configuration { public int version { get; set; } public Profile profile { get; set; } public string apiKey { get; set; } }
class StableModelSetup {
    static readonly byte[] Magic = Encoding.ASCII.GetBytes("STABLEMODELSETUP1");
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 65536 };
    static string Self { get { return Application.ExecutablePath; } }
    [STAThread] static int Main(string[] args) {
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        try {
            if (args.Length == 2 && args[0] == "--check-installation") return Compatible(args[1]) ? 0 : 1;
            var payload = ReadPayload();
            if (payload != null) {
                var config = Json.Deserialize<Configuration>(Encoding.UTF8.GetString(payload)); Validate(config);
                if (args.Length == 2 && args[0] == "--stage-only") { Stage(config, Path.GetFullPath(args[1])); return 0; }
                Install(config); return 0;
            }
            // CLI uses a local input file, never command-line credentials.
            if (args.Length == 3 && args[0] == "--build") { var config = Json.Deserialize<Configuration>(File.ReadAllText(args[1], Encoding.UTF8)); Build(config, args[2]); return 0; }
            Application.Run(new Generator()); return 0;
        } catch {
            if (args.Length == 0) MessageBox.Show("操作未完成。请检查文件权限、配置内容和 Stable 版本后重试。", "Stable 模型配置", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
    static byte[] ReadPayload() {
        using (var stream = File.OpenRead(Self)) {
            if (stream.Length < Magic.Length + 4) return null;
            stream.Seek(-Magic.Length, SeekOrigin.End); var magic = new byte[Magic.Length]; stream.Read(magic, 0, magic.Length);
            if (!magic.SequenceEqual(Magic)) return null;
            stream.Seek(-Magic.Length - 4, SeekOrigin.End); var length = new byte[4]; stream.Read(length, 0, 4); int size = BitConverter.ToInt32(length, 0);
            if (size < 1 || size > 65536 || size > stream.Length - Magic.Length - 4) throw new InvalidDataException();
            stream.Seek(-Magic.Length - 4 - size, SeekOrigin.End); var payload = new byte[size]; if (stream.Read(payload, 0, size) != size) throw new InvalidDataException(); return payload;
        }
    }
    static void Validate(Configuration c) {
        Uri uri;
        if (c == null || c.version != 1 || c.profile == null || String.IsNullOrWhiteSpace(c.apiKey) || c.apiKey.Length > 4096) throw new InvalidDataException();
        var p = c.profile;
        if (!System.Text.RegularExpressions.Regex.IsMatch(p.providerId ?? "", "^[a-z0-9_-]{1,80}$") || String.IsNullOrWhiteSpace(p.displayName) || p.displayName.Length > 80 || String.IsNullOrWhiteSpace(p.model) || p.model.Length > 160) throw new InvalidDataException();
        if (!Uri.TryCreate(p.baseURL, UriKind.Absolute, out uri) || uri.Scheme != "https" || uri.UserInfo != "" || uri.Query != "" || uri.Fragment != "" || p.baseURL.Length > 500) throw new InvalidDataException();
    }
    public static void Build(Configuration config, string output) {
        Validate(config);
        if (String.Equals(Path.GetFullPath(output), Path.GetFullPath(Self), StringComparison.OrdinalIgnoreCase)) throw new IOException();
        var bytes = Encoding.UTF8.GetBytes(Json.Serialize(config));
        var temp = output + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try {
            using (var stream = new FileStream(temp, FileMode.CreateNew)) {
                var exe = File.ReadAllBytes(Self); stream.Write(exe, 0, exe.Length); stream.Write(bytes, 0, bytes.Length);
                var length = BitConverter.GetBytes(bytes.Length); stream.Write(length, 0, length.Length); stream.Write(Magic, 0, Magic.Length);
            }
            if (File.Exists(output)) File.Replace(temp, output, null); else File.Move(temp, output);
        } finally { Array.Clear(bytes, 0, bytes.Length); if (File.Exists(temp)) File.Delete(temp); }
    }
    static void Stage(Configuration config, string root) {
        Directory.CreateDirectory(root);
        var bytes = Encoding.UTF8.GetBytes(Json.Serialize(config));
        byte[] encrypted;
        try { encrypted = ProtectedData.Protect(bytes, Encoding.UTF8.GetBytes("Stable/local-model/v2"), DataProtectionScope.CurrentUser); }
        finally { Array.Clear(bytes, 0, bytes.Length); }
        string content = Json.Serialize(new { version = 1, protection = "windows-dpapi-current-user", data = Convert.ToBase64String(encrypted) });
        string file = Path.Combine(root, "model-setup.pending.json"), temp = file + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try {
            File.WriteAllText(temp, content, new UTF8Encoding(false));
            if (File.Exists(file)) File.Replace(temp, file, null); else File.Move(temp, file);
            string status = Path.Combine(root, "model-setup.status.json"); if (File.Exists(status)) File.Delete(status);
        } finally { if (File.Exists(temp)) File.Delete(temp); }
    }
    static string FindStable() {
        foreach (var path in new[] { Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Stable", "Stable.exe"), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "stable-desktop", "Stable.exe"), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Stable", "Stable.exe") }) if (File.Exists(path)) return path;
        foreach (var hive in new[] { Registry.CurrentUser, Registry.LocalMachine }) {
            using (var uninstall = hive.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall")) {
                if (uninstall == null) continue;
                foreach (var name in uninstall.GetSubKeyNames()) using (var entry = uninstall.OpenSubKey(name)) {
                    if (entry == null || !String.Equals(Convert.ToString(entry.GetValue("DisplayName")), "Stable", StringComparison.OrdinalIgnoreCase)) continue;
                    string location = Convert.ToString(entry.GetValue("InstallLocation"));
                    if (!String.IsNullOrWhiteSpace(location)) { string exe = Path.Combine(location.Trim('"'), "Stable.exe"); if (File.Exists(exe)) return exe; }
                }
            }
        }
        using (var dialog = new OpenFileDialog { Title = "请选择已安装的 Stable.exe（需要 1.0.5 本地配置版或更新版本）", Filter = "Stable 程序|Stable.exe" }) return dialog.ShowDialog() == DialogResult.OK ? dialog.FileName : null;
    }
    static void Install(Configuration config) {
        string exe = FindStable(); if (exe == null) return;
        if (!Compatible(exe)) {
            MessageBox.Show("请先安装随配置生成器提供的 Stable 1.0.5 本地配置版，再运行此配置包。", "需要更新 Stable"); return;
        }
        while (Process.GetProcessesByName("Stable").Length > 0) {
            if (MessageBox.Show("请先保存任务并完全退出 Stable（包括托盘），然后点击重试。配置程序不会强制结束任务。", "Stable 正在运行", MessageBoxButtons.RetryCancel) != DialogResult.Retry) return;
        }
        string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "stable-desktop");
        // An explicit profile selection supports portable/test installations without guessing among databases.
        if ((Control.ModifierKeys & Keys.Shift) == Keys.Shift) using (var folder = new FolderBrowserDialog { Description = "选择 Stable 数据目录（包含 stable.db 的文件夹）", SelectedPath = root }) {
            if (folder.ShowDialog() != DialogResult.OK) return; root = folder.SelectedPath;
        }
        Stage(config, root);
        var start = new ProcessStartInfo(exe, "--stable-user-data=\"" + root + "\"") { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(exe) };
        start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE"); start.EnvironmentVariables.Remove("STABLE_CLOUD_ENABLED"); start.EnvironmentVariables.Remove("STABLE_QA_USER_DATA");
        Process.Start(start);
        using (var wait = new Form { Text = "Stable 模型配置", Size = new Size(490, 180), StartPosition = FormStartPosition.CenterScreen, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false }) {
            var label = new Label { Text = "配置已安全写入，正在等待 Stable 导入…", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, Padding = new Padding(20) }; wait.Controls.Add(label);
            var timer = new Timer { Interval = 1000 }; int ticks = 0;
            timer.Tick += delegate {
                ticks++; string status = Path.Combine(root, "model-setup.status.json");
                if (File.Exists(status)) {
                    try { var result = Json.Deserialize<System.Collections.Generic.Dictionary<string, object>>(File.ReadAllText(status));
                        bool ok = Convert.ToString(result["status"]) == "loaded";
                        timer.Stop(); label.Text = ok ? "配置成功，Stable 已选择模型：\n" + config.profile.displayName + "\n可以关闭此窗口并开始使用。" : "Stable 未能导入配置。请检查其提示，随后重新运行配置包。";
                    } catch { }
                } else if (ticks >= 60) { timer.Stop(); label.Text = "配置已写入，但未收到导入结果。请检查 Stable 是否正常启动；下次启动会继续导入。"; }
            };
            wait.FormClosed += delegate { timer.Dispose(); }; timer.Start(); Application.Run(wait);
        }
    }
    static bool Compatible(string exe) {
        var info = FileVersionInfo.GetVersionInfo(exe);
        return info.ProductMajorPart > 1 || (info.ProductMajorPart == 1 && (info.ProductMinorPart > 0 || info.ProductBuildPart >= 5));
    }
}

class Generator : Form {
    TextBox provider = new TextBox { Text = "deepseek" }, title = new TextBox { Text = "DeepSeek" }, endpoint = new TextBox { Text = "https://api.deepseek.com" }, model = new TextBox(), key = new TextBox { UseSystemPasswordChar = true };
    public Generator() {
        Text = "Stable 配置包生成器"; Size = new Size(610, 490); StartPosition = FormStartPosition.CenterScreen; MinimumSize = Size; Font = new Font("Microsoft YaHei UI", 10);
        var table = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Padding = new Padding(24), AutoScroll = true };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 140)); table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); Controls.Add(table);
        Add(table, "服务 ID", provider); Add(table, "显示名称", title); Add(table, "API 基础地址", endpoint); Add(table, "实际模型 ID", model); Add(table, "接收用户 API Key", key);
        var note = new Label { Text = "填写后生成一个 EXE 发给用户。用户需先安装配套 Stable 1.0.5。生成器不保存你填写的 Key；生成的配置包包含可提取的 Key。", AutoSize = true, MaximumSize = new Size(520, 0), Margin = new Padding(0, 16, 0, 16) }; table.Controls.Add(note); table.SetColumnSpan(note, 2);
        var button = new Button { Text = "生成用户配置包…", AutoSize = true, Padding = new Padding(12, 6, 12, 6) }; table.Controls.Add(button); table.SetColumnSpan(button, 2); AcceptButton = button;
        button.Click += delegate {
            using (var save = new SaveFileDialog { Title = "保存可发送给用户的配置包", Filter = "Windows 配置程序|*.exe", FileName = "Stable-模型配置.exe" }) {
                if (save.ShowDialog() != DialogResult.OK) return;
                try { StableModelSetup.Build(new Configuration { version = 1, profile = new Profile { providerId = provider.Text.Trim(), displayName = title.Text.Trim(), baseURL = endpoint.Text.Trim().TrimEnd('/'), model = model.Text.Trim() }, apiKey = key.Text.Trim() }, save.FileName); key.Clear(); MessageBox.Show("配置包已生成，可将该 EXE 发给用户。", "完成"); }
                catch { MessageBox.Show("未能生成。请检查服务 ID（小写字母、数字、连字符或下划线）、HTTPS 地址、模型 ID、Key 和输出文件权限。", "配置有误"); }
            }
        };
    }
    static void Add(TableLayoutPanel panel, string label, TextBox input) { panel.Controls.Add(new Label { Text = label, AutoSize = true, Margin = new Padding(0, 10, 8, 10) }); input.Dock = DockStyle.Top; input.Margin = new Padding(0, 6, 0, 6); panel.Controls.Add(input); }
}
