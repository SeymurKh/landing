# EssKeyMusic Landing Page

A modern, performance-optimized landing page for the EssKeyMusic YouTube channel.

## 🎯 Features

- **Progressive Web App (PWA)** - Installable on mobile devices
- **Dark Theme** - Optimized for ambient music aesthetic
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Performance Optimized** - Lazy loading, skeleton screens, caching
- **Accessibility** - ARIA labels, keyboard navigation, reduced motion support
- **SEO Optimized** - Structured data, meta tags, canonical URLs

## 📁 Project Structure

```
.
├── index.html              # Main HTML file
├── styles.css              # Source CSS
├── styles.min.css          # Minified CSS (generated)
├── script.js               # Source JavaScript
├── script.min.js           # Minified JavaScript (generated)
├── manifest.json           # PWA manifest
├── .gitignore              # Git ignore rules
├── .gitattributes          # Git file attributes
├── assets/
│   └── noise.svg           # Grain texture overlay
├── bg-video.mp4            # Background video (MP4)
├── bg-video.webm           # Background video (WebM)
├── yt-channel-logo-circle.webp
└── yt-channel-favicon-circle.webp
```

## 🚀 Quick Start

### Local Development

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd landing
   ```

2. Open `index.html` in your browser

3. For live reload, use a local server:
   ```bash
   # Python 3
   python -m http.server 8000

   # Node.js (with http-server)
   npx http-server
   ```

### Building for Production

Minify CSS and JavaScript:

```bash
# Using cssnano
npx cssnano styles.css styles.min.css

# Using terser
npx terser script.js -o script.min.js -c -m
```

## 📊 Performance

| Metric | Value |
|--------|-------|
| First Contentful Paint | < 1s |
| Largest Contentful Paint | < 2s |
| Time to Interactive | < 3s |
| Cumulative Layout Shift | < 0.1 |

## 🔧 Configuration

Edit `script.js` to customize:

```javascript
const CONFIG = {
  CHANNEL_ID: "UCa9kWM8BbmFi5OpXbjyqk9w",
  VISIBLE_VIDEO_COUNT: 6,
  CACHE_TTL: 3 * 60 * 1000, // 3 minutes
  PRELOADER_MAX_TIME: 8000,
  RSS_TIMEOUT: 12000,
  PARALLAX_FACTOR: 0.03,
};
```

## 🎨 Customization

### Colors

Edit `styles.css` CSS variables:

```css
:root {
  --bg: #0b0b0b;
  --panel: #121212;
  --line: rgba(255, 255, 255, 0.14);
  --text: #ececec;
  --muted: #a8a8a8;
  --soft: #d3d3d3;
  --accent: #f1f1f1;
}
```

### Fonts

Current fonts:
- **Manrope** - UI text
- **Cormorant Garamond** - Headings

To change fonts, update in `index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=YourFont:wght@400;500;700&display=swap" rel="stylesheet" />
```

## 📱 PWA Installation

The site is installable as a PWA:

1. Open the site in Chrome/Edge on mobile
2. Tap "Add to Home Screen"
3. The app will launch in standalone mode

## 🔍 SEO

The site includes:
- Open Graph tags
- Twitter Card tags
- Structured data (JSON-LD)
- Canonical URLs
- Meta descriptions

## ♿ Accessibility

- ARIA labels for interactive elements
- Keyboard navigation support
- Reduced motion support
- Focus indicators
- Semantic HTML

## 📝 License

MIT License - feel free to use this project for your own needs.

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📧 Contact

- Email: EssKey_YTB@protonmail.com
- YouTube: https://www.youtube.com/@EssKeyMusic

---

Built with ❤️ for EssKeyMusic