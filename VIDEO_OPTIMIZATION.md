# Video Optimization Guide

## Current Status
- `bg-video.mp4`: 11.6 MB (TOO LARGE!)
- `bg-video.webm`: 3.9 MB (GOOD)

## Target Goals
- MP4: ~2-3 MB (reduce from 11.6 MB)
- WebM: ~1.5-2 MB (reduce from 3.9 MB)
- Resolution: 1280x720 or 960x540
- Bitrate: 1-2 Mbps

## Method 1: Using HandBrake (GUI)

1. Download HandBrake: https://handbrake.fr/
2. Open `bg-video.mp4`
3. Settings:
   - **Format**: MP4
   - **Video Codec**: H.264 (x264)
   - **Quality**: Constant Quality RF 22-24
   - **Resolution**: Limit to 1280x720
   - **Framerate**: Same as source (usually 30fps)
4. Click "Start Encode"

## Method 2: Using FFmpeg (CLI)

### Optimize MP4
```bash
ffmpeg -i bg-video.mp4 -c:v libx264 -crf 23 -preset medium -vf "scale=1280:-2" -c:a aac -b:a 128k -movflags +faststart bg-video-optimized.mp4
```

### Optimize WebM
```bash
ffmpeg -i bg-video.webm -c:v libvpx-vp9 -crf 30 -b:v 1M -vf "scale=1280:-2" -c:a libopus -b:a 128k bg-video-optimized.webm
```

### Parameters Explained
- `-c:v libx264`: Use H.264 codec (best compatibility)
- `-crf 23`: Quality (18-28 is good range, lower = better quality)
- `-preset medium`: Encoding speed (faster = larger file)
- `-vf "scale=1280:-2"`: Resize to 1280px width, auto height
- `-c:a aac`: Audio codec
- `-b:a 128k`: Audio bitrate
- `-movflags +faststart`: Enable streaming (faster start)

## Method 3: Online Tools

1. **CloudConvert**: https://cloudconvert.com/mp4-converter
2. **Convertio**: https://convertio.co/ru/mp4-compressor/
3. **YouCompress**: https://www.youcompress.com/

## After Optimization

1. Replace old files:
   ```bash
   mv bg-video-optimized.mp4 bg-video.mp4
   mv bg-video-optimized.webm bg-video.webm
   ```

2. Test in browser:
   - Open `index.html`
   - Check DevTools Network tab
   - Verify video loads quickly

3. Commit changes:
   ```bash
   git add bg-video.mp4 bg-video.webm
   git commit -m "Optimize background video (reduce size from 11.6MB to ~2MB)"
   ```

## Additional Tips

- Use shorter video loops (10-15 seconds is enough)
- Remove audio if not needed (saves ~10-15%)
- Consider using only WebP if browser support is sufficient
- Test on mobile devices (3G/4G connection)

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| MP4 Size | < 3 MB | 11.6 MB ❌ |
| WebM Size | < 2 MB | 3.9 MB ⚠️ |
| Load Time (3G) | < 3s | ~8s ❌ |
| Load Time (4G) | < 1s | ~2s ⚠️ |