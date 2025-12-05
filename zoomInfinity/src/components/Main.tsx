// App.tsx
import { useRef, useState } from "react";
import Peer from "peerjs";
import type { MediaConnection } from "peerjs";
import { VideoFeed } from "../utils/VideoFeed";
import { ControlBar } from "../utils/ControlBar";

export default function App() {
  const [room, setRoom] = useState("ninja-room");
  const [joined, setJoined] = useState(false);
  const [myId, setMyId] = useState<string>("");
  const [startWithVideo, setStartWithVideo] = useState(false);

  // Media state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);

  // Peers: Map<peerId, stream>
  const [peers, setPeers] = useState<Map<string, MediaStream>>(new Map());

  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callsRef = useRef<Map<string, MediaConnection>>(new Map());

  // Add peer stream
  const addPeerStream = (id: string, stream: MediaStream) => {
    setPeers((prev) => {
      const updated = new Map(prev);
      updated.set(id, stream);
      return updated;
    });
  };

  // Remove peer
  const removePeer = (id: string) => {
    setPeers((prev) => {
      const updated = new Map(prev);
      updated.delete(id);
      return updated;
    });
    callsRef.current.delete(id);
  };

  // Setup incoming/outgoing call
  const setupCall = (
    call: MediaConnection,
    streamToAnswerWith?: MediaStream
  ) => {
    const peerId = call.peer;

    if (callsRef.current.has(peerId)) return;
    callsRef.current.set(peerId, call);

    if (streamToAnswerWith) {
      call.answer(streamToAnswerWith);
    }

    call.on("stream", (remoteStream) => {
      addPeerStream(peerId, remoteStream);
    });

    call.on("close", () => removePeer(peerId));
    call.on("error", (err) => {
      console.error("Call error:", err);
      removePeer(peerId);
    });
  };

  // Join as Host or Guest
  const join = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: startWithVideo ? { width: 1280, height: 720 } : false,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setVideoEnabled(startWithVideo);

      // Try to become Host using room name as ID
      const peer = new Peer(room, {
        config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
      });

      peer.on("open", (id) => {
        setMyId(id);
        setJoined(true);
        console.log("Host connected:", id);
      });

      peer.on("error", (err: any) => {
        if (err.type === "unavailable-id") {
          peer.destroy();
          initGuest(stream);
        } else {
          console.error(err);
          alert("Connection failed: " + err.message);
        }
      });

      // Incoming calls (Host receives from guests)
      peer.on("call", (call) => {
        setupCall(call, stream);

        // Help new guest discover existing peers
        setTimeout(() => {
          const existing = Array.from(callsRef.current.keys()).filter(
            (id) => id !== call.peer
          );
          if (existing.length > 0) {
            const conn = peer.connect(call.peer);
            conn.on("open", () => {
              conn.send({ type: "peer-list", peers: existing });
              setTimeout(() => conn.close(), 1000);
            });
          }
        }, 1000);
      });

      peerRef.current = peer;
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "NotFoundError") {
        alert("Microphone access is required to join the call.");
      } else {
        alert("Failed to access microphone/camera. Please check permissions.");
      }
    }
  };

  // Join as Guest
  const initGuest = (stream: MediaStream) => {
    const guest = new Peer();

    guest.on("open", (id) => {
      setMyId(id);
      setJoined(true);
      console.log("Guest connected:", id);

      // Call the host
      const call = guest.call(room, stream);
      setupCall(call);
    });

    guest.on("call", (call) => setupCall(call, stream));

    guest.on("connection", (conn) => {
      conn.on("data", (data: any) => {
        if (data.type === "peer-list" && Array.isArray(data.peers)) {
          data.peers.forEach((peerId: string) => {
            if (!callsRef.current.has(peerId)) {
              const call = guest.call(peerId, stream);
              setupCall(call);
            }
          });
        }
      });
    });

    peerRef.current = guest;
  };

  // Toggle microphone
  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMuted(!audioTrack.enabled);
    }
  };

  // Toggle camera (can turn on even if started without video)
  const toggleVideo = async () => {
    if (!localStreamRef.current) return;

    if (screenSharing) {
      await stopScreenShare();
      return;
    }

    const hasVideo = localStreamRef.current.getVideoTracks().length > 0;

    if (hasVideo) {
      const track = localStreamRef.current.getVideoTracks()[0];
      track.enabled = !track.enabled;
      setVideoEnabled(track.enabled);
    } else {
      // First time enabling video
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        const videoTrack = videoStream.getVideoTracks()[0];

        localStreamRef.current.addTrack(videoTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        setVideoEnabled(true);

        // Update all peers
        callsRef.current.forEach((call) => {
          const sender = call.peerConnection
            .getSenders()
            .find((s: RTCRtpSender) => s.track?.kind === "video");
          sender?.replaceTrack(videoTrack);
        });
      } catch (err) {
        alert("Could not access camera.");
      }
    }
  };

  // Screen Share
  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      const videoTrack = screenStream.getVideoTracks()[0];
      videoTrack.onended = stopScreenShare;

      if (localStreamRef.current) {
        const oldTrack = localStreamRef.current.getVideoTracks()[0];
        if (oldTrack) {
          localStreamRef.current.removeTrack(oldTrack);
          oldTrack.stop();
        }

        localStreamRef.current.addTrack(videoTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        setScreenSharing(true);
        setVideoEnabled(true);

        // Replace in all calls
        callsRef.current.forEach((call) => {
          const sender = call.peerConnection
            .getSenders()
            .find((s: RTCRtpSender) => s.track?.kind === "video");
          sender?.replaceTrack(videoTrack);
        });
      }
    } catch (err) {
      console.log("Screen share cancelled or failed");
    }
  };

  const stopScreenShare = async () => {
    if (!screenSharing || !localStreamRef.current) return;

    const screenTrack = localStreamRef.current.getVideoTracks()[0];
    screenTrack?.stop();
    localStreamRef.current.removeTrack(screenTrack);

    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      const camTrack = camStream.getVideoTracks()[0];

      localStreamRef.current.addTrack(camTrack);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      setScreenSharing(false);

      callsRef.current.forEach((call) => {
        const sender = call.peerConnection
          .getSenders()
          .find((s: RTCRtpSender) => s.track?.kind === "video");
        sender?.replaceTrack(camTrack);
      });
    } catch (err) {
      setVideoEnabled(false); // No camera available
    }
  };

  const toggleScreenShare = () =>
    screenSharing ? stopScreenShare() : startScreenShare();

  // Leave call
  const leave = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    callsRef.current.forEach((call) => call.close());
    callsRef.current.clear();
    peerRef.current?.destroy();

    setJoined(false);
    setPeers(new Map());
    setLocalStream(null);
    setScreenSharing(false);
    setVideoEnabled(false);
    setMuted(false);
  };

  // Render: Pre-join screen
  if (!joined) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-8 md:p-12 text-center max-w-lg w-full shadow-2xl">
          <div className="h-2 bg-linear-to-r from-emerald-500 via-blue-500 to-purple-500 rounded-t-3xl -mt-8 -mx-8 mb-8"></div>

          <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-linear-to-br from-emerald-400 to-emerald-600 mb-2">
            AI Crafter
          </h1>
          <p className="text-zinc-400 mb-10 text-lg">
            Group Video & Screen Sharing
          </p>

          <input
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="Room name"
            className="w-full px-6 py-4 bg-zinc-800 rounded-xl text-xl outline-none focus:border-emerald-500 border-2 border-transparent transition mb-8"
          />

          <div className="flex items-center justify-center gap-4 mb-10">
            <button
              onClick={() => setStartWithVideo(!startWithVideo)}
              className={`relative inline-flex h-8 w-16 rounded-full hover:cursor-pointer transition ${
                startWithVideo ? "bg-emerald-500" : "bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-8 w-8 bg-white rounded-full shadow transform transition ${
                  startWithVideo ? "translate-x-8" : "translate-x-0"
                }`}
              />
            </button>
            <span className="text-lg">
              Start with{" "}
              <span className="text-emerald-400 font-medium">
                video {startWithVideo ? "on" : "off"}
              </span>
            </span>
          </div>

          <button
            onClick={join}
            className="w-full bg-emerald-500 hover:cursor-pointer hover:bg-emerald-400 text-black font-bold text-2xl py-5 rounded-xl transition transform hover:scale-105 active:scale-95"
          >
            Join Call {startWithVideo ? "with Video" : "(Audio Only)"}
          </button>

          <p className="mt-6 text-sm text-zinc-500">
            Microphone required • Video optional
          </p>
        </div>
      </div>
    );
  }

  const peerArray = Array.from(peers.entries());

  return (
    <div className="min-h-screen bg-black text-white relative">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 p-6 z-10 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-emerald-500">AI Crafter</h1>
          <div className="flex items-center gap-2 mt-2 bg-zinc-900/80 backdrop-blur px-4 py-2 rounded-full">
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-mono">{room}</span>
          </div>
        </div>
        <div className="bg-zinc-900/80 backdrop-blur px-5 py-3 rounded-xl">
          <span className="font-medium">{peerArray.length + 1} online</span>
        </div>
      </header>

      {/* Video Grid */}
      <main className="h-screen flex flex-col justify-center p-6 pb-32">
        <div
          className={`grid gap-4 max-w-7xl mx-auto w-full ${
            peerArray.length + 1 === 1
              ? "grid-cols-1"
              : peerArray.length + 1 <= 4
              ? "grid-cols-2"
              : peerArray.length + 1 <= 9
              ? "grid-cols-3"
              : "grid-cols-4"
          } auto-rows-fr`}
        >
          {/* Local Video */}
          <VideoFeed
            stream={localStream}
            isLocal={true}
            label={myId === room ? `${myId} (You - Host)` : myId}
            isMuted={muted}
            isVideoOff={!videoEnabled && !screenSharing}
          />

          {/* Remote Peers */}
          {peerArray.map(([id, stream]) => (
            <VideoFeed
              key={id}
              stream={stream}
              label={id}
              isMuted={false}
              isVideoOff={
                stream.getVideoTracks().length === 0 ||
                !stream.getVideoTracks()[0]?.enabled
              }
            />
          ))}
        </div>
      </main>

      {/* Control Bar */}
      <ControlBar
        muted={muted}
        videoEnabled={videoEnabled || screenSharing}
        screenSharing={screenSharing}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onToggleScreenShare={toggleScreenShare}
        onLeave={leave}
      />
    </div>
  );
}
