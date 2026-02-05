---
name: creating-slidev-presentations
description: Creates presentation slides using Slidev with Markdown syntax. Configures themes, layouts, animations, and exports to PDF/PPTX. Use for building interactive web-based presentations for developers.
---

# Creating Slidev Presentations

Slidev is a web-based slide maker designed for developers. Write slides in
Markdown, leverage Vue 3 components, and export to PDF, PPTX, or PNG. Ideal for
technical presentations, demos, and interactive content.

## Quick Start

### Create a New Project

```bash
npm init slidev
# or
pnpm create slidev
```

### Basic Commands

```bash
npm run dev        # Start development server (http://localhost:5173)
npm run build      # Build as static site
npm run export     # Export to PDF, PPTX, or PNG
npm run format     # Format slides.md
```

## Slidev Markdown Structure

### File Organization

- **slides.md** - Main presentation file (default)
- **public/** - Static assets (images, files)
- **package.json** - Dependencies and scripts

### Slide Separators

Use `---` with blank lines to separate slides:

```markdown
---
layout: cover
---

# Title Slide

---

# Content Slide
```

## Frontmatter Configuration

### Headmatter (First Slide)

Configure the entire presentation in the first slide's frontmatter:

```yaml
---
theme: default
title: My Presentation
info: Presentation description
author: Your Name
highlighter: shiki
lineNumbers: true
mdc: true
css: unocss
shiki:
  theme: nord
layout: cover
---
```

### Per-Slide Frontmatter

Configure individual slides:

```yaml
---
layout: two-cols
background: url('/bg.jpg')
clicks: 3
transition: slide-left
---
```

## Key Frontmatter Options

| Option       | Values                                                  | Purpose                     |
| ------------ | ------------------------------------------------------- | --------------------------- |
| `theme`      | `default`, `dark`, custom theme                         | Presentation theme          |
| `layout`     | `cover`, `default`, `two-cols`, `image-right`, `center` | Slide layout                |
| `background` | URL or color (#0D1117)                                  | Slide background            |
| `transition` | `slide-left`, `fade`, `none`                            | Slide transition animation  |
| `clicks`     | Number                                                  | Animation click steps       |
| `hideInToc`  | Boolean                                                 | Hide from table of contents |
| `disabled`   | Boolean                                                 | Skip slide in export        |
| `preload`    | Boolean                                                 | Preload before navigation   |

## Markdown Features

### Code Blocks with Syntax Highlighting

```markdown
\`\`\`typescript async function agent() { const skills = await Skill.all(); }
\`\`\`

\`\`\`python {1,3}

# Line 1 highlighted

print("not highlighted") print("highlighted") \`\`\`
```

### Scoped CSS

Add styles to specific slides:

```markdown
<style scoped>
h1 {
  color: #58A6FF;
}
</style>
```

### Vue Components

Use Vue 3 components in slides:

```vue
<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>

<template>
  <button @click="count++">
    Count: {{ count }}
  </button>
</template>
```

### Presenter Notes

Add notes visible only to presenter:

```markdown
---
layout: cover
---

# Title Slide

<!-- This is a presenter note, not shown to audience -->
```

## Common Layouts

### Cover Slide

```yaml
---
layout: cover
---

# My Presentation
```

### Title + Content

```yaml
---
layout: default
---

# Section Title

- Bullet point 1
- Bullet point 2
```

### Two Columns

```yaml
---
layout: two-cols
---

::left::
# Left Column
Content

::right::
# Right Column
Content
```

### Image Right

```yaml
---
layout: image-right
image: /path/to/image.png
---

# Title

Content on left, image on right
```

### Center Layout

```yaml
---
layout: center
---

# Centered Content
```

## Styling Slides

### Inline Styles

```html
<div style="color: #58a6ff; font-size: 24px">
  Styled text
</div>
```

### CSS Classes

```markdown
<div class="text-blue-500 text-xl font-bold">
  Styled with UnoCSS
</div>
```

### Global Styles

Add to headmatter `<style>` block:

```markdown
---

## ...

<style>
.slidev-layout {
  background: #0D1117 !important;
}

h1 {
  color: #F8FAFC !important;
}
</style>
```

## Advanced Features

### Diagrams with Mermaid

```markdown
\`\`\`mermaid graph LR A[Start] --> B[Process] --> C[End] \`\`\`
```

### LaTeX Math

```markdown
$$
E = mc^2
$$

Inline: $\alpha = \frac{\beta}{\gamma}$
```

### Animations & Clicks

```markdown
---
clicks: 3
---

# Title

<v-click>This appears on click 1</v-click>
<v-click>This appears on click 2</v-click>
```

### Draggable Elements

```markdown
<div v-drag="'id-key'" style="position: absolute;">
  Drag me around
</div>
```

## Exporting Presentations

### Export to PDF

```bash
npm run export -- --format pdf
npm run export -- --format pdf --output my-slides.pdf
```

### Export to PPTX

```bash
npm run export -- --format pptx
# All slides exported as images for compatibility
```

### Export to PNG

```bash
npm run export -- --format png
# Creates PNG for each slide in dist/
```

### Export with Animations

```bash
npm run export -- --format pdf --with-clicks
# Exports multiple pages per slide with animation steps
```

### Export Options

```bash
# Specific slide range
npm run export -- --range 1,3-5,10

# Dark mode
npm run export -- --dark

# Increase timeout for large presentations
npm run export -- --timeout 60000

# Add table of contents
npm run export -- --with-toc
```

## Configuration File (slidev.config.ts)

Create `slidev.config.ts` for advanced configuration:

```typescript
import { defineConfig } from "@slidev/cli";

export default defineConfig({
  // Enable/disable features
  monaco: true,
  twoslash: true,
  recorder: true,

  // Export settings
  export: {
    format: "pdf",
    timeout: 30000,
    dark: false,
  },

  // Theme configuration
  themeConfig: {
    primary: "#5d8392",
  },
});
```

## Best Practices

### Content Organization

- Keep headmatter clean and focused
- Use descriptive slide titles
- One idea per slide
- Limit bullet points to 3-5 per slide

### Code in Presentations

- Use syntax highlighting with language specification
- Highlight important lines with `{1,3}`
- Show complete, runnable examples
- Explain code before revealing it with `<v-click>`

### Styling

- Use consistent color scheme
- Define global styles in headmatter
- Use scoped styles for slide-specific customization
- Test dark mode for exports

### Interactive Elements

- Use Vue components for dynamic content
- Add click animations for complex topics
- Include live code examples with Monaco editor
- Record demos when presenting remotely

### Accessibility

- Use semantic HTML elements
- Ensure sufficient color contrast
- Provide alt text for images
- Test with screen readers

## Common Issues

### Blank First Page

Ensure headmatter is properly formatted and includes `layout: cover` if needed.
First `---` marks headmatter start, second `---` marks headmatter end.

### Code Block Rendering Issues

- Verify language is specified: `` ```typescript ``
- Ensure blank lines around code blocks
- Use proper escaping for special characters

### Export Failures

- Install Playwright: `npm install -D playwright-chromium`
- Use modern Chromium browser
- Increase timeout for large presentations
- Check for missing fonts or images

### Styling Not Applied

- Use `!important` for global overrides
- Scope CSS with `<style scoped>`
- Check CSS specificity
- Clear browser cache

## Resources

- **Official Docs**: https://sli.dev
- **GitHub**: https://github.com/slidevjs/slidev
- **Discord**: https://chat.sli.dev
- **Examples**: https://sli.dev/resources/theme-gallery

## Integration with Development Workflow

### Version Control

- Commit `slides.md` to git
- Ignore `dist/`, `node_modules/`, `.git-pptx/`
- Use `.gitignore`:
  ```
  dist/
  node_modules/
  *.pdf
  *.pptx
  *.png
  ```

### CI/CD Export

```yaml
# GitHub Actions example
- name: Export slides to PDF
  run: npx slidev export --format pdf
```

### Embedding in Web Projects

Build as static site and host:

```bash
npm run build
# Deploy dist/ folder to web server
```

## Example: Technical Presentation Template

```markdown
---
theme: default
background: "#0D1117"
title: Agent Skills Integration
author: Your Name
highlighter: shiki
layout: cover
---

<style>
.slidev-layout {
  background: #0D1117 !important;
}

h1, h2, h3 {
  color: #F8FAFC !important;
}

p, li {
  color: #E2E8F0 !important;
}
</style>

# Agent Skills Integration

Building reusable skill components

---

# Overview

- Skill definition and structure
- Automatic discovery
- System prompt injection
- Tool registration

---

# Implementation

\`\`\`typescript export function createSkillTool(skills: SkillInfo[]) { return
tool({ description: 'Load a skill', execute: async ({ name }) => { return await
Skill.load(name); }, }); } \`\`\`

---
layout: center
---

# Questions?
```

## Workflow for Creating Professional Presentations

1. **Plan**: Outline content and structure
2. **Draft**: Write slides.md with basic content
3. **Style**: Add CSS, themes, and layout configuration
4. **Animate**: Add interactions and animations
5. **Test**: Preview in browser, test exports
6. **Export**: Generate PDF/PPTX for distribution
7. **Present**: Use Slidev dev server with presenter mode

## FAQ - Common Pitfalls & Solutions

### Blank First Page Issue

**Problem**: First slide appears blank even with content defined.

**Root Cause**:

- Empty space between headmatter closing `---` and content
- Headmatter not properly containing opening content
- Missing `layout` configuration in headmatter

**Solution**:

```yaml
---
theme: default
title: My Presentation
layout: cover
---

# Title Content Starts Here Immediately

No blank lines between --- and content!
```

**Key Points**:

- Headmatter must have `layout: cover` for first slide to display properly
- Content starts immediately after closing `---`
- Do NOT have blank lines between `---` and `#` heading
- The first slide content is part of the headmatter, not a separate slide

### Markdown Code Blocks in HTML Containers

**Problem**: Code blocks don't render when nested inside HTML `<div>` elements.

````markdown
<!-- ❌ WRONG -->
<div class="code-container">
  <div class="code-content">
```markdown
const x = 1;
````

</div>
</div>

<!-- ✅ CORRECT -->
<div class="code-container">
  <div class="code-content">

\`\`\`markdown const x = 1; \`\`\`

</div>
</div>
```

**Root Cause**: Slidev's markdown parser requires blank lines around code
blocks, even inside HTML.

**Solution**:

- Add blank line BEFORE opening backticks
- Add blank line AFTER closing backticks
- Indent appropriately for readability

### Code Block Background Colors Not Working

**Problem**: Global `<style>` color overrides for code blocks are ignored.

**Root Cause**: Shiki syntax highlighter applies inline styles with higher
specificity, and MDC/Vue markdown rendering creates additional nested elements.

**Solution**: Use `!important` in CSS rules:

```css
<style>
.code-content {
  padding: 16px 20px;
  background: #0F172A !important;
  color: #F1F5F9;
}

.code-content pre {
  background: #0F172A !important;
}

.code-content code {
  background: #0F172A !important;
  color: #F1F5F9 !important;
}
</style>
```

### Headings Appear Black in Dark Theme

**Problem**: `<h1>`, `<h2>`, `<h3>` tags render in black despite global style
definitions.

**Root Cause**:

- Default theme styles have high specificity
- Vue component scoping interferes with global selectors
- CSS classes generated by Slidev override simple selectors

**Solution**: Define heading styles in headmatter `<style>` block with multiple
selector specificity:

```css
<style>
/* Use both bare selectors AND .slidev-layout selectors */
h1, h2, h3 {
  color: #F8FAFC !important;
}

.slidev-layout h1 {
  color: #F8FAFC !important;
}

.slidev-layout h2 {
  color: #F8FAFC !important;
}

.slidev-layout h3 {
  color: #F8FAFC !important;
}
</style>
```

### Inconsistent Styling Across Multiple Slides

**Problem**: Some slides have correct styling, others appear broken (wrong
background, missing colors).

**Root Cause**: Individual slides not inheriting global frontmatter
configuration. Each slide using `src:` import needs its own frontmatter.

**Solution**: Either:

1. **Merge all slides into single file** (Recommended for small presentations):

```markdown
---
theme: default
background: "#0D1117"
layout: cover
---

<style>
/* Global styles here */
</style>

# First Slide

---

# Second Slide

---

# Third Slide
```

2. **Or add frontmatter to each external slide file**:

```yaml
---
background: "#0D1117"
---

# Slide Content
```

### Using src: Import Creates Empty Blank Slide

**Problem**: Using `src: ./slides/01-cover.md` in frontmatter creates an
unwanted blank page.

**Root Cause**: Slidev treats `src:` import as a slide reference within the
frontmatter, creating a slide separator.

**Solution**: Don't use `src:` in headmatter. Merge all content into single
`slides.md` file:

```markdown
<!-- ❌ WRONG --> ---

## theme: default src: ./slides/01-cover.md

<!-- ✅ CORRECT --> ---

## theme: default

<style>
/* styles */
</style>

# Content here

---

# Next slide
```

### Font/Color Changes Not Visible

**Problem**: CSS color definitions work locally but fail in exports (PDF/PPTX).

**Root Cause**:

- Browser uses fallback fonts in export
- CSS specificity issues in print context
- Missing `!important` flags

**Solution**:

```css
<style>
/* Always use !important for export compatibility */
h1 {
  color: #F8FAFC !important;
}

p {
  color: #E2E8F0 !important;
}

code {
  background: #1E293B !important;
  color: #38BDF8 !important;
}
</style>
```

### Export Command Not Found

**Problem**: `slidev export` command fails or not recognized.

**Root Cause**: `@slidev/cli` not installed or playwright-chromium missing.

**Solution**:

```bash
# Install/reinstall dependencies
npm install

# Install playwright for export
npm install -D playwright-chromium

# Try export again
npm run export -- --format pdf
```

### Special Characters in Code Blocks Break Rendering

**Problem**: Angle brackets `<>`, curly braces `{}` in code blocks cause parsing
errors or display issues.

**Root Cause**: Vue/MDC markdown parser treats these as component syntax.

**Solution**: In inline code within markdown content, use HTML entities:

- `<` → `&lt;`
- `>` → `&gt;`
- `{` → `&#123;`
- `}` → `&#125;`

```markdown
Generate `&lt;available_skills&gt;` XML list

<!-- For code blocks, this usually isn't needed -->

\`\`\`typescript const xml = `<skill>data</skill>`; \`\`\`
```

### Scoped Styles Not Applying

**Problem**: `<style scoped>` block doesn't affect slide elements.

**Root Cause**: Vue scoping requires `scoped` attribute AND proper element
hierarchy.

**Solution**:

```markdown
---
layout: default
---

<style scoped>
/* Scoped styles only affect direct children of this slide */
h2 {
  color: #58A6FF;
}

.custom-class {
  font-weight: bold;
}
</style>

# Title

<div class="custom-class">Affected by scoped style</div>
```

### Images Not Loading in Presentation

**Problem**: Images referenced in slides don't display.

**Root Cause**: Incorrect path references. Slidev serves static assets from
`public/` folder.

**Solution**:

```markdown
<!-- ❌ WRONG -->
<img src="./images/pic.png">

<!-- ✅ CORRECT -->
<img src="/images/pic.png">

<!-- Even simpler for images in public/ root -->
<img src="/pic.png">

<!-- Markdown image syntax also works -->

![Alt text](/pic.png)
```

Store images in `public/` folder at project root.

### Large Presentations Take Forever to Export

**Problem**: `slidev export` takes many minutes or times out.

**Root Cause**: Complex layouts, large code blocks, or too many animations
requiring render time.

**Solution**:

```bash
# Increase timeout (in milliseconds)
npm run export -- --format pdf --timeout 60000

# Add wait time between slides
npm run export -- --format pdf --wait 1000

# Export specific slide range for testing
npm run export -- --range 1-5

# Omit animations to speed up rendering
npm run export -- --format pdf --with-clicks false
```

### Presenter Notes Not Showing

**Problem**: HTML comments added as presenter notes don't appear in presenter
view.

**Root Cause**: Notes must be placed at the END of the slide, not at the
beginning.

**Solution**:

```markdown
---
layout: default
---

# Slide Title

Visible content here.

<!-- This is NOT a note - too early -->

More content.

<!-- This IS a presenter note - at the end of slide -->
```

Notes appear in the Slidev UI presenter panel when you click the presentation.

### Line Highlighting in Code Blocks Not Working

**Problem**: Line number ranges like `{1,3}` don't highlight specified lines.

**Root Cause**:

- Language not specified for code block
- Syntax: `{1,3}` must immediately follow backticks and language
- Shiki highlighter requires proper configuration

**Solution**:

```markdown
<!-- ✅ CORRECT -->

\`\`\`typescript {1,3} const a = 1; // Line 1 - highlighted const b = 2; // Line
2 - normal const c = 3; // Line 3 - highlighted \`\`\`

<!-- ❌ WRONG - no language or space before braces -->

\`\`\` {1,3} const a = 1; \`\`\`
```

### Theme Not Applying Globally

**Problem**: Changing `theme:` in headmatter has no effect.

**Root Cause**: Theme must be specified BEFORE other configuration. Some
configurations override theme defaults.

**Solution**:

```yaml
---
# THEME MUST BE FIRST
theme: default

# Then other config
title: My Presentation
background: '#0D1117'

# Per-slide overrides at the end
layout: cover
---
```

If using custom theme, ensure it's installed:

```bash
npm install @slidev/theme-myname
```

Then:

```yaml
---
theme: myname
---
```
