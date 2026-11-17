<p align="center">
  <a href="https://yogurt.so?utm_source=github&utm_medium=readme&utm_campaign=yogurt">
    <img src="docs/assets/readme-header.svg" width="212" height="86" alt="Yogurt. Take note.">
  </a>
</p>

<p align="center">
  Private AI meeting notes. A free, open-source alternative to Granola.
</p>

<p align="center">
  Download for <a href="https://github.com/oxygen0827/yogurt/releases/download/fork-0.3.27.2/Yogurt-mac-arm64.dmg">Mac (Apple Silicon, fork)</a> · <a href="https://github.com/FrigadeHQ/yogurt/releases/latest/download/Yogurt-windows-x64.exe">Windows (upstream)</a> · <a href="https://github.com/FrigadeHQ/yogurt/releases/latest/download/Yogurt-linux-x86_64.AppImage">Linux (upstream)</a>
</p>

<p align="center">
  <img src="docs/assets/yogurt-screenshot.webp" width="1074" alt="Yogurt showing the Summary of a launch planning meeting: the plan, next steps by person, and your own reminders">
</p>

<p align="center">
  Yogurt records your calls without adding a bot to the meeting.
</p>
<p></p>
<p align="center">
  <sub>macOS 14.4+ (Apple Silicon) · Windows 10 2004+ (x64) · Ubuntu 22.04+ or similar (x64 AppImage) · 8 GB memory</sub><br><br>
  <a href="https://yogurt.so?utm_source=github&utm_medium=readme&utm_campaign=yogurt">yogurt.so</a> · <a href="docs/README.md">Help</a> · <a href="docs/building.md">Build and run locally</a> · <a href="LICENSE">MIT license</a><br><br>
  Made by <a href="https://frigade.com?utm_source=github&utm_medium=readme&utm_campaign=yogurt">Frigade</a>.
</p>

## 本机版安装与更新（Apple Silicon）

页首提供 `fork-0.3.27.2` 的 Apple Silicon 安装包，包含腾讯会议与飞书支持、会议文件夹、云端模型和实验性的微信在线转写。此安装包使用 Yogurt Local 自签名证书，未经 Apple 公证。

在自己的 Mac 上准备名为 `Yogurt Local` 的有效代码签名身份后，在仓库根目录运行 `npm run package:mac:local`。生成的安装包位于 `app/dist/local-signed/Yogurt-mac-arm64.dmg`。将 Yogurt 放入「应用程序」，在「系统设置 → 隐私与安全性 → 辅助功能」中添加并开启它，即可使用发言人标注。后续本机更新请复用同一证书和打包命令，以便 macOS 沿用授权。详见[构建说明](docs/building.md)。

## 会议文件与云端纪要

在「设置 → 会议数据存储位置」可以更改存储位置，也可以直接打开会议目录。每场结束的会议按「日期 会议名称」建文件夹，包含保留下来的音轨、`转写.md` 和 `会议纪要.md`。在 Finder 移走整场会议的文件夹会把这场会议移入 Yogurt 的废纸篓。单独删除 Markdown 只删除该文件，应用仍可搜索数据库中的文字。关闭会后保留录音后，符合条件的会议完成转写并保存纪要时会清理音频。手动导出 Markdown 不触发清理。

在「设置 → 纪要与问答模型」启用云端，填写 API Key 并保存。默认地址为 `https://api.deepseek.com`，模型为 `deepseek-flash`。也可使用兼容 OpenAI Chat Completions 的流式接口。生成纪要和问答所需的文字会发送给该服务，会议检索仍在本机执行。API Key 加密保存在应用配置中。

## 微信输入法在线转写（macOS，实验功能）

当前源码支持用微信输入法服务转写新会议的双方音频。开启前使用 Yogurt 原有的本地识别；开启后的语音片段会发送到腾讯，会议库保存在本机，纪要使用设置中选择的模型。这个功能使用 [VoiceKey](https://github.com/J3n5en/voicekey) 的非官方 WeType 协议，服务变更可能影响可用性。

1. 如果安装包已随附组件，可直接进入下一步。从源码构建时，在 Mac 上安装 Git、Rust 和 CMake，运行 `sh app/scripts/install-wetype.sh` 编译并安装固定版本的识别组件。打自用安装包时可添加 `--bundle` 参数。
2. 在此源码构建的 Yogurt 中，打开「设置 → 语言 → 微信输入法在线转写」。初次设置也可在模型准备界面选择，选好后完全退出并重新打开。
3. 开始一场新会议，录音界面会显示「微信在线转写」「本地 Whisper」或「转写暂不可用」。语音停顿或分段后会出现定稿。已有会议的补转写仍在本地执行。关闭选项即可让新会议恢复使用本地模型；如果此前跳过了本地语音模型，重启后会下载它。

在 16 GB 及以上的 Apple Silicon Mac 上，微信在线转写期间，本地纪要模型可以分批预读已定稿的文字。积压时优先转写，会后生成完整纪要。

## 腾讯会议与飞书会议（macOS）

此 fork 为腾讯会议和飞书的 Mac 桌面客户端增加了录制提醒和发言人标注。

- **录制提醒**：当客户端使用麦克风时，Yogurt 会提示你录制，点击确认后才开始。麦克风测试也可能触发提醒；如果静音入会时客户端尚未使用麦克风，可以在 Yogurt 中手动开始录音。
- **发言人标注**：在「系统设置 → 隐私与安全性 → 辅助功能」中允许 Yogurt 后，它会读取会议窗口显示的发言人姓名，并标到对方的转写上。客户端没有提供明确标记时，转写保留「对方」。录制提醒无需这项权限。

## What it does

- **Live transcripts.** Yogurt records calls and turns speech into text as you talk.
- **Meeting summaries.** Yogurt writes up the conversation and any notes you add.
- **Private by default.** In local mode your audio, transcripts and AI processing stay on your computer. Optional WeType transcription sends speech to Tencent. Enabling cloud notes and Ask sends the text needed for each request to your configured endpoint.
- **Free and open source.** You can use Yogurt without an account.
- **Who said what.** On Mac, Yogurt can label remote speakers when Zoom, Teams, Meet, Tencent Meeting or Feishu shows who is speaking.
- **Languages.** Multi-language mode transcribes 99 languages.
- **Recording reminders.** Yogurt offers to record when a supported call starts.
- **Answers with sources.** Yogurt answers questions across meetings and links to the source.
- **Folders and search.** You can find meetings by folder, title, notes or transcript.
- **Copy and export.** You can copy notes or transcripts, or save both as Markdown.
- **Local MCP server.** Your chosen assistant app can read your notes when you allow access.
- **Automatic stop.** Yogurt stops recording when the call ends.

## Watch the demo

https://github.com/user-attachments/assets/da16b894-beb1-491a-89e1-fd10666dc9b8

## How it works

1. **Record.** Start recording your microphone and call audio; you can add your own notes.
2. **Transcribe.** Yogurt uses whisper.cpp and, on supported Macs, Apple SpeechAnalyzer.
3. **Summarize and ask.** Use a local model through llama.cpp or configure a compatible cloud endpoint in Settings.

Meeting files are saved locally. Optional online transcription and cloud text generation send their inputs to the selected service.

<details><summary>Where your meetings, recordings, settings and models are stored</summary>

- Mac uses `~/Library/Application Support/Yogurt`.
- Windows uses `%APPDATA%\Yogurt`.
- Linux uses `~/.config/Yogurt`, or `$XDG_CONFIG_HOME/Yogurt` if set.

</details>

## FAQ

<details><summary><strong>What kind of computer do I need?</strong></summary>

<br>

> A Mac with Apple silicon and macOS 14.4 or newer, a 64-bit PC with Windows 10 (version 2004) or newer, or a 64-bit Linux computer with Ubuntu 22.04 or newer. Each needs at least 8 GB of memory. If your computer is too slow, Yogurt tells you during setup. Calendar and speaker names from calls are Mac only for now.

</details>

<details><summary><strong>Windows says “Windows protected your PC.” What do I do?</strong></summary>

<br>

> Click More info, then Run anyway. Windows shows this for new apps that aren’t signed with a Microsoft certificate yet. Yogurt is open source, so anyone can check what it does.

</details>

<details><summary><strong>Does Yogurt join my meetings?</strong></summary>

<br>

> No. Yogurt records your microphone and the sound playing on your computer. No bot joins the call, so let the other people on the call know you’re recording.

</details>

<details><summary><strong>Are recordings saved?</strong></summary>

<br>

> Yes. Your recordings, transcripts, and notes are saved locally on your computer.

</details>

<details><summary><strong>Is Yogurt free?</strong></summary>

<br>

> Yes. Yogurt is free and open source under the MIT license. No account is needed.

</details>

<details><summary><strong>Does Yogurt work offline?</strong></summary>

<br>

> Yes in local mode. After downloading the models, transcription and summaries run on your computer. WeType and remote model endpoints require an internet connection.

</details>

<details><summary><strong>How much does setup download?</strong></summary>

<br>

> It depends on your computer. Yogurt downloads a smaller notes model first, about 5 GB, then the best one your computer can run well, which can be 14 GB or more. Recording works once setup finishes, and notes and questions work offline once the notes model is in.

</details>

<details><summary><strong>How do I connect my assistant app?</strong></summary>

<br>

> In **Settings → AI apps**, turn on access, copy the helper command, and add it as a local MCP server in your assistant app. Access is off by default. The app can read your meetings, notes and transcripts, but cannot change them. It may send what it reads to its own online model. Turn access off in Yogurt to stop further reads.

</details>

<details><summary><strong>Can other apps read my notes through MCP?</strong></summary>

<br>

> Access is off until you enable it in **Settings → AI apps**. Apps get read-only access to meetings, notes and transcripts. Mac and Linux use a socket in your profile folder with `0600` permissions, so only your user account can open it. Windows uses a named pipe with a new random name each launch, stored only in your profile folder. There is no per-app token, so any app running under your account can read while access is on. Settings shows connected apps by their self-reported names.

</details>

<details><summary><strong>Which AI models does Yogurt use?</strong></summary>

<br>

> Transcription uses Whisper through whisper.cpp, with large-v3-turbo or a smaller model depending on your computer. On supported Macs, Apple SpeechAnalyzer supplies live words while Whisper produces the saved transcript. By default, summaries and answers use a local open-weight model from the Gemma 4, gpt-oss or Qwen3 families, chosen for your hardware and run through llama.cpp. The app uses Electron and needs no account.

</details>

<details><summary><strong>Which languages does Yogurt support?</strong></summary>

<br>

> Pick **Multi-language** in **Settings → Language → Spoken language** to transcribe 99 languages. You can also switch from the **English** menu in a note’s footer before or during recording. English only is the default. Summaries follow the meeting’s main language; answers follow your question’s language. Settings also offers 32 app languages.

</details>

<details><summary><strong>Which call apps does Yogurt work with?</strong></summary>

<br>

> You can record calls in any app because Yogurt captures your microphone and system audio. Call detection covers Zoom, Teams and Meet. This fork also detects microphone use by the Tencent Meeting (腾讯会议) and Feishu (飞书) desktop apps on macOS and offers to record. Grant Yogurt Accessibility access to label remote speakers when the meeting window identifies them.

</details>

<details><summary><strong>How does Yogurt know a call has started?</strong></summary>

<br>

> It checks which apps are using your microphone. For browser calls, it also checks the tab title or a nearby calendar event with a call link. This triggers an offer to record; recording starts only when you choose to.

</details>

<details><summary><strong>How do I connect my calendar?</strong></summary>

<br>

> On Mac, allow Calendar access in Settings. Yogurt reads the calendars already on your computer and lets you choose which ones to show. You do not sign into a calendar account in Yogurt.

</details>

## Build from source

See [Build and run locally](docs/building.md) for setup, tests and installer builds.

## License

[MIT](LICENSE) · Copyright 2026 Frigade.
