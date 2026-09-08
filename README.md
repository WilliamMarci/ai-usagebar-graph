# AI Usage Bar Graph

AI Usage Bar Graph is a compact GNOME Shell panel extension for viewing AI quota usage, reset times, and recent activity without giving up valuable panel space. It is a fork-inspired continuation of `akitaonrails/ai-usagebar`.

## Features

- Composable ring, rounded-bar, text, countdown, and GitHub-style heatmap blocks
- Any number of ordered blocks and up to eight independently configured layers per ring or bar
- Per-layer provider, quota source, used/remaining mode, thickness, spacing, labels, severity colors, and optional ring position dots
- Single- or double-line text with quota placeholders such as `{5h_quota}`, `{1w_quota}`, `{session_remaining}`, and provider-prefixed variants such as `{openai_weekly_remaining}`
- Configurable Monday/Sunday heatmap alignment and four usage intensity shades derived from the selected theme color
- Panel placement in the left, center, or right GNOME Shell box
- Provider connection checks and clear warnings for unsupported visual data sources
- Settings import/export (exports may contain configured API keys)

Supported providers include Anthropic, OpenAI/Codex, Z.AI, OpenRouter, DeepSeek, Kimi, and OpenCode. DeepSeek can optionally use the OpenCode aggregate quota source.

## Install for development

Clone the repository into:

```text
~/.local/share/gnome-shell/extensions/ai-usagebar@wilfison
```

Compile the settings schema:

```sh
glib-compile-schemas schemas
```

Then log out and back in before enabling the extension. GNOME Shell does not reliably reload extension JavaScript or schemas in-place on Wayland.

## Configuration and data

Open the extension preferences to arrange the indicator and configure providers. Refreshes are intentionally low-frequency (minimum five minutes) to keep CPU/network overhead low and respect upstream rate limits. Credentials remain in GNOME settings or their configured files/environment variables; the extension does not send them anywhere except the selected provider endpoint.

Exported settings files are plain JSON and may include inline API keys. Store them accordingly.

## Development checks

```sh
node --check extension.js
node --check prefs.js
node --check ui/panelVisual.js
glib-compile-schemas --strict schemas
```

The intended repository name is `ai-usage-bar-graph`.
