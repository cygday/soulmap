# Video Call & Mobile Zoom Fixes

## Issues Fixed

### 1. **Video Call Not Showing - Both Sides' Videos Missing**
**Problem:** When users started a video call, the videos were being captured (WebRTC streams) but not displayed to either party.

**Root Cause:** The video elements (`<video>` tags) for both local and remote videos were created in the refs but never rendered in the JSX during the call.

**Solution:** Added a complete video player component that displays during `isCalling` state with:
- **Remote Video (large):** Shows the other user's video with mirrored effect
- **Local Video (small PIP):** Picture-in-picture of your own video with pink border
- Proper error states showing "Waiting for video..." when stream hasn't loaded yet
- Mobile-responsive layout (stacked on mobile, side-by-side on desktop)

### 2. **Mobile Auto-Zoom Issue**
**Problem:** The mobile app was auto-zooming/expanding when users tapped on inputs or started video calls.

**Root Cause:** Viewport meta tag was missing `user-scalable=no` and `maximum-scale=1.0` settings, and missing touch-action CSS rules.

**Solution:** 
- Updated viewport meta tag with: `user-scalable=no, maximum-scale=1.0, viewport-fit=cover`
- Added CSS rules:
  - `input, select, textarea, button { font-size: 16px }` - Prevents auto-zoom on focus
  - `touch-action: manipulation` - Disables pinch zoom
  - Fixed body positioning on mobile to prevent viewport jumping

## Files Modified

### 1. `/frontend/index.html`
```html
<!-- Before -->
<meta name="viewport" content="width=device-width, initial-scale=1.0" />

<!-- After -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```

### 2. `/frontend/src/App.tsx`
- Added video player section with dual video display during calls
- Remote video takes up 2/3 of space (large)
- Local video in PIP format (1/3 of space, pink bordered)
- Proper video element setup with:
  - `autoPlay` - Auto-starts when stream available
  - `playsInline` - On mobile, plays inline instead of fullscreen
  - `muted` - Local video is muted to prevent echo
  - `transform: 'scaleX(-1)'` - Mirror effect for natural view
  - `objectFit: 'cover'` - Maintains aspect ratio

### 3. `/frontend/src/App.css`
Added mobile and video-specific CSS:
```css
/* Prevent auto-zoom on input focus */
input, select, textarea, button {
  font-size: 16px;
}

/* Prevent pinch zoom */
@media (max-width: 900px) {
  * {
    touch-action: manipulation;
  }
  body {
    position: fixed;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
}
```

## How it Works Now

1. **Initiating a Call:**
   - Click "🎥 Video Call" button next to match
   - Your camera/mic is requested
   - Local video appears in small PIP window
   - Remote video shows "Waiting for video..." until they answer

2. **Receiving a Call:**
   - Notification popup appears with Accept/Decline buttons
   - Click Accept to enable camera
   - Both videos appear automatically once WebRTC peer connection established
   - Can continue chatting while on video call

3. **Mobile Experience:**
   - No auto-zoom when tapping inputs
   - Videos stack vertically on small screens
   - Messages panel below video (scrollable)
   - Clean PIP layout for better mobile viewing

## Technical Details

### WebRTC Flow:
1. **Offerer (call initiator):**
   - `setupWebRTC()` → gets local stream
   - `peer.addTrack()` → adds audio/video tracks
   - `peer.createOffer()` → creates offer
   - Sends offer via websocket

2. **Answerer (accepts call):**
   - Receives offer
   - `setupWebRTC()` → gets local stream
   - `peer.setRemoteDescription()` → sets offer
   - `peer.createAnswer()` → creates answer
   - Sends answer back

3. **Both sides:**
   - Exchange ICE candidates via websocket
   - When tracks received → `peer.ontrack` fires
   - Sets remote video srcObject: `remoteVideoRef.current.srcObject = event.streams[0]`

### Video Elements Setup:
- **Local:** `<video ref={localVideoRef} muted autoPlay playsInline />`
- **Remote:** `<video ref={remoteVideoRef} autoPlay playsInline />`
- Both have: `objectFit: 'cover'` and `transform: 'scaleX(-1)'`

## Testing Checklist

- [ ] Start video call - both videos should appear
- [ ] Local video shows in small PIP with pink border
- [ ] Remote video shows larger in main area
- [ ] On mobile - no auto-zoom when typing
- [ ] On mobile - videos stack vertically
- [ ] Hang up button properly stops streams
- [ ] Can still send messages while on call
- [ ] Video quality is smooth on desktop and mobile
- [ ] Mobile video doesn't get cut off
- [ ] Pinch-zoom is disabled on mobile

## Notes

- Videos are mirrored with `scaleX(-1)` so you see yourself like in a mirror
- Audio is controlled separately through WebRTC audio tracks (already working)
- ICE candidates are exchanged for connection establishment (backend already handles)
- All streams are properly cleaned up on disconnect/hangup
