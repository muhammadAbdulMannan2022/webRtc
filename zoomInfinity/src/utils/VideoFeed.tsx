import React, { useEffect, useRef } from "react";

interface VideoFeedProps {
  stream: MediaStream | null;
  isLocal?: boolean;
  label: string;
  isMuted?: boolean;
  isVideoOff?: boolean;
}

export const VideoFeed: React.FC<VideoFeedProps> = ({
  stream,
  isLocal = false,
  label,
  isMuted = false,
  isVideoOff = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative bg-zinc-800 rounded-2xl overflow-hidden aspect-video border-2 border-zinc-700 shadow-lg group">
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal} // Always mute local video to prevent echo
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isVideoOff ? "opacity-0" : "opacity-100"
        } ${isLocal ? "scale-x-[-1]" : ""}`}
      />

      {/* Fallback for Video Off */}
      <div
        className={`absolute inset-0 flex items-center justify-center bg-zinc-850 transition-opacity duration-300 ${
          isVideoOff ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="w-20 h-20 rounded-full bg-zinc-700 flex items-center justify-center">
          <span className="text-4xl text-zinc-400 font-bold uppercase">
            {label.slice(0, 2)}
          </span>
        </div>
      </div>

      {/* Overlay Info */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-from-black/80 to-transparent flex justify-between items-end">
        <span className="text-sm font-medium text-white shadow-black drop-shadow-md truncate max-w-[70%]">
          {label} {isLocal ? "(You)" : ""}
        </span>

        <div className="flex gap-2">
          {isMuted && (
            <div className="bg-red-500/90 p-1.5 rounded-full backdrop-blur-sm">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-4 h-4 text-white"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
                />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Active Speaker Border (Simulated) */}
      {!isLocal && !isMuted && (
        <div className="absolute inset-0 border-4 border-emerald-500/0 transition-colors duration-200" />
      )}
    </div>
  );
};
