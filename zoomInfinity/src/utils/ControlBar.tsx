import { Camera, CameraOff, Mic, MicOff, ScreenShare } from "lucide-react";
import React from "react";

interface ControlBarProps {
  muted: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onLeave: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  muted,
  videoEnabled,
  screenSharing,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onLeave,
}) => {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-zinc-900/90 backdrop-blur-md px-6 py-4 rounded-full border border-zinc-700 shadow-2xl z-50 max-w-[95vw]">
      {/* Audio Toggle */}
      <button
        onClick={onToggleMute}
        className={`p-4 rounded-full transition-all duration-200 ${
          muted
            ? "bg-red-500 hover:bg-red-600 text-white"
            : "bg-zinc-700 hover:bg-zinc-600 text-white"
        }`}
        title={muted ? "Unmute" : "Mute"}
      >
        {muted ? <MicOff /> : <Mic />}
      </button>

      {/* Video Toggle */}
      <button
        onClick={onToggleVideo}
        disabled={screenSharing} // Disable camera toggle while screen sharing
        className={`p-4 rounded-full hover:cursor-pointer transition-all duration-200 ${
          !videoEnabled
            ? "bg-red-500 hover:bg-red-600 text-white"
            : "bg-zinc-700 hover:bg-zinc-600 text-white"
        } ${screenSharing ? "opacity-50 cursor-not-allowed" : ""}`}
        title={videoEnabled ? "Stop Camera" : "Start Camera"}
      >
        {!videoEnabled ? <CameraOff /> : <Camera />}
      </button>

      {/* Screen Share */}
      <button
        onClick={onToggleScreenShare}
        className={`p-4 rounded-full transition-all hover:cursor-pointer duration-200 hidden sm:block ${
          screenSharing
            ? "bg-emerald-500 hover:bg-emerald-600 text-white"
            : "bg-zinc-700 hover:bg-zinc-600 text-white"
        }`}
        title={screenSharing ? "Stop Sharing" : "Share Screen"}
      >
        <ScreenShare />
      </button>

      {/* Leave */}
      <button
        onClick={onLeave}
        className="px-6 py-4 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold tracking-wide transition-colors duration-200"
      >
        Leave
      </button>
    </div>
  );
};
