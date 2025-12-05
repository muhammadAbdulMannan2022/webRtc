import { useRef, useState } from "react";
import Peer from "peerjs";
import type { MediaConnection } from "peerjs";
import { VideoFeed } from "../utils/VideoFeed";
import { ControlBar } from "../utils/ControlBar";

export default function App() {
  const [room, setRoom] = useState("party2025");
  const [joined, setJoined] = useState(false);
  const [myId, setMyId] = useState<string>("");

  // Media State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  // Peer State (mapped by ID)
  const [peers, setPeers] = useState<Map<string, MediaStream>>(new Map());

  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null); // Keep a ref for immediate access in callbacks
  const callsRef = useRef<Map<string, MediaConnection>>(new Map());

  // Add a peer's stream to state
  const addPeerStream = (id: string, stream: MediaStream) => {
    setPeers((prev) => {
      const newMap = new Map(prev);
      newMap.set(id, stream);
      return newMap;
    });
  };

  // Remove a peer
  const removePeer = (id: string) => {
    setPeers((prev) => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
    callsRef.current.delete(id);
  };

  // Handle incoming or outgoing call setup
  const setupCall = (
    call: MediaConnection,
    streamToAnswerWith?: MediaStream
  ) => {
    const peerId = call.peer;

    // Prevent duplicate handling if we already have this call stored
    if (callsRef.current.has(peerId)) {
      // If we initiated the call, we might already have it.
      // If it's incoming, we need to answer.
      // For simplicity in this mesh, we might double-set, but let's check.
    }

    callsRef.current.set(peerId, call);

    // If incoming call and we have a stream, answer it
    if (streamToAnswerWith) {
      call.answer(streamToAnswerWith);
    }

    call.on("stream", (remoteStream) => {
      addPeerStream(peerId, remoteStream);
    });

    call.on("close", () => {
      removePeer(peerId);
    });

    call.on("error", (err) => {
      console.error("Call error:", err);
      removePeer(peerId);
    });
  };

  const join = async () => {
    try {
      // 1. Get Initial Media (Audio + Video)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });

      setLocalStream(stream);
      localStreamRef.current = stream;

      // 2. Initialize Peer
      const peer = new Peer(room, {
        config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
        debug: 1,
      });

      peer.on("open", (id) => {
        console.log("Joined as Host:", id);
        setMyId(id);
        setJoined(true);
      });

      // Handle ID collision (Room taken -> Become Guest)
      peer.on("error", (err: any) => {
        if (err.type === "unavailable-id") {
          peer.destroy();
          initGuest(stream);
        } else {
          console.error("Peer Error:", err);
          alert("Connection error: " + err.type);
        }
      });

      // Handle Incoming Calls (Host Logic)
      peer.on("call", (call) => {
        setupCall(call, stream);

        // Logic to introduce new guest to existing peers (Mesh network coordination)
        // Note: In a pure mesh without a server, usually everyone connects to everyone manually.
        // Here, the host acts as a signaling helper by sending the peer list.
        setTimeout(() => {
          const existingPeers = Array.from(callsRef.current.keys()).filter(
            (id) => id !== call.peer
          );

          if (existingPeers.length > 0) {
            const conn = peer.connect(call.peer);
            conn.on("open", () => {
              conn.send({ type: "peer-list", peers: existingPeers });
              setTimeout(() => conn.close(), 1000);
            });
          }
        }, 1000);
      });

      peerRef.current = peer;
    } catch (error) {
      console.error("Error accessing media:", error);
      alert("Microphone/Camera access required.");
    }
  };

  const initGuest = (stream: MediaStream) => {
    const guest = new Peer();

    guest.on("open", (id) => {
      console.log("Joined as Guest:", id);
      setMyId(id);
      setJoined(true);

      // Call the Host immediately
      const call = guest.call(room, stream);
      setupCall(call);
    });

    // Answer calls from other guests
    guest.on("call", (call) => {
      setupCall(call, stream);
    });

    // Receive Peer List from Host to connect to others
    guest.on("connection", (conn) => {
      conn.on("data", (data: any) => {
        if (data.type === "peer-list" && Array.isArray(data.peers)) {
          data.peers.forEach((peerId: string) => {
            // Connect to other guests if not already connected
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

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMuted(!audioTrack.enabled);
    }
  };

  const toggleVideo = async () => {
    if (!localStreamRef.current) return;

    // If screen sharing, stop it first before toggling camera
    if (screenSharing) {
      await stopScreenShare();
      return;
    }

    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setVideoEnabled(videoTrack.enabled);
    }
  };

  const startScreenShare = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const videoTrack = displayStream.getVideoTracks()[0];

      videoTrack.onended = () => {
        stopScreenShare();
      };

      if (localStreamRef.current) {
        const currentVideoTrack = localStreamRef.current.getVideoTracks()[0];
        if (currentVideoTrack) {
          localStreamRef.current.removeTrack(currentVideoTrack);

          currentVideoTrack.stop();
        }
        localStreamRef.current.addTrack(videoTrack);

        // Force state update to re-render local video feed
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        setScreenSharing(true);
        setVideoEnabled(true); // Screen share counts as "video on"

        // Replace track in all active peer connections
        replaceTrackInCalls(videoTrack);
      }
    } catch (err) {
      console.error("Error starting screen share:", err);
    }
  };

  const stopScreenShare = async () => {
    try {
      // Get camera stream again
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      const newVideoTrack = cameraStream.getVideoTracks()[0];

      // Clean up current screen share track
      if (localStreamRef.current) {
        const currentVideoTrack = localStreamRef.current.getVideoTracks()[0];
        if (currentVideoTrack) {
          currentVideoTrack.stop();
          localStreamRef.current.removeTrack(currentVideoTrack);
        }
        localStreamRef.current.addTrack(newVideoTrack);

        // Update state
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        setScreenSharing(false);
        setVideoEnabled(true);

        // Replace track in calls
        replaceTrackInCalls(newVideoTrack);
      }
    } catch (err) {
      console.error("Error stopping screen share:", err);
    }
  };

  const replaceTrackInCalls = (newTrack: MediaStreamTrack) => {
    callsRef.current.forEach((call) => {
      const sender = call.peerConnection
        .getSenders()
        .find((s: RTCRtpSender) => s.track?.kind === "video");
      if (sender) {
        sender.replaceTrack(newTrack);
      }
    });
  };

  const toggleScreenShare = () => {
    if (screenSharing) {
      stopScreenShare();
    } else {
      startScreenShare();
    }
  };

  const leave = () => {
    // Stop all tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Close calls
    callsRef.current.forEach((call) => call.close());
    callsRef.current.clear();

    // Destroy peer
    if (peerRef.current) {
      peerRef.current.destroy();
    }

    setJoined(false);
    setPeers(new Map());
    setLocalStream(null);
    setScreenSharing(false);
    setVideoEnabled(true);
    setMuted(false);
  };

  // --- Render ---

  if (!joined) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-8 md:p-12 text-center max-w-lg w-full shadow-2xl relative overflow-hidden">
          {/* Decorative gradients */}
          <div className="absolute top-0 left-0 w-full h-2 bg-linear-to-r from-emerald-500 via-blue-500 to-purple-500"></div>

          <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-linear-to-br from-emerald-400 to-emerald-600 mb-2">
            Party2025
          </h1>
          <p className="text-zinc-400 mb-8 text-lg">
            Group Video & Screen Sharing
          </p>

          <div className="relative mb-6">
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className="w-full px-6 py-4 bg-zinc-800 text-white rounded-xl text-xl outline-none border-2 border-transparent focus:border-emerald-500 transition-all placeholder-zinc-500"
              placeholder="Enter Room Name"
            />
          </div>

          <button
            onClick={join}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-2xl py-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Join Call
          </button>
        </div>
      </div>
    );
  }

  const peerArray = Array.from(peers.entries());

  return (
    <div className="min-h-screen bg-black text-white relative">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 p-6 z-10 flex justify-between items-start pointer-events-none">
        <div>
          <h1 className="text-2xl font-bold text-emerald-500 drop-shadow-md pointer-events-auto">
            Party2025
          </h1>
          <div className="bg-zinc-900/80 backdrop-blur px-3 py-1 rounded-full mt-2 inline-flex items-center gap-2 pointer-events-auto">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs text-zinc-300 font-mono">{room}</span>
          </div>
        </div>
        <div className="bg-zinc-900/80 backdrop-blur px-4 py-2 rounded-lg pointer-events-auto">
          <span className="text-zinc-300 text-sm font-medium">
            {peerArray.length + 1} Participants
          </span>
        </div>
      </header>

      {/* Video Grid */}
      <main className="p-4 md:p-6 h-screen flex flex-col justify-center">
        <div
          className={`grid gap-4 w-full max-w-7xl mx-auto auto-rows-fr ${
            peerArray.length + 1 === 1
              ? "grid-cols-1 max-w-4xl"
              : peerArray.length + 1 <= 2
              ? "grid-cols-1 md:grid-cols-2"
              : peerArray.length + 1 <= 4
              ? "grid-cols-2"
              : peerArray.length + 1 <= 6
              ? "grid-cols-2 lg:grid-cols-3"
              : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          }`}
        >
          {/* My Feed */}
          <VideoFeed
            stream={localStream}
            isLocal={true}
            label={myId === room ? `${myId} (Host)` : myId}
            isMuted={muted}
            isVideoOff={!videoEnabled && !screenSharing}
          />

          {/* Peer Feeds */}
          {peerArray.map(([id, stream]) => (
            <VideoFeed
              key={id}
              stream={stream}
              label={id}
              isMuted={false} // We don't track peer mute state in this simple version, assume audio track handles silence
              isVideoOff={
                stream.getVideoTracks().length === 0 ||
                !stream.getVideoTracks()[0].enabled
              }
            />
          ))}
        </div>
      </main>

      {/* Controls */}
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
