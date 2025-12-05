"use client";

import { useRef, useState } from "react";
import Peer from "peerjs";

export default function App() {
  const [room, setRoom] = useState("party2025");
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peers, setPeers] = useState<string[]>([]);

  const peerRef = useRef<Peer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const callsRef = useRef<Map<string, any>>(new Map());
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  const join = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Try to be host
      const peer = new Peer(room, {
        config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
      });

      peer.on("open", (id) => {
        console.log("HOST:", id);
        setJoined(true);
      });

      peer.on("error", (err: any) => {
        if (err.type === "unavailable-id") {
          peer.destroy();
          const guest = new Peer();

          guest.on("open", (guestId) => {
            console.log("GUEST:", guestId);
            setJoined(true);
            const call = guest.call(room, stream);
            handleCall(call, guest);
          });

          // Guests listen for incoming calls from other guests
          guest.on("call", (call) => {
            call.answer(stream);
            handleCall(call, guest);
          });

          // Guests receive peer list from host
          guest.on("connection", (conn) => {
            conn.on("data", (data: any) => {
              if (data.type === "peer-list") {
                // Call all existing peers
                data.peers.forEach((peerId: string) => {
                  setTimeout(() => {
                    if (!callsRef.current.has(peerId)) {
                      const call = guest.call(peerId, stream);
                      handleCall(call, guest);
                    }
                  }, 500);
                });
              }
            });
          });

          peerRef.current = guest;
        }
      });

      // Host listens for incoming calls
      peer.on("call", (call) => {
        call.answer(stream);
        handleCall(call, peer);

        // HOST: Tell new guest about all existing peers
        setTimeout(() => {
          const existingPeers = Array.from(callsRef.current.keys()).filter(
            (id) => id !== call.peer
          );

          // Send list of existing peers to new guest via data channel
          const conn = peer.connect(call.peer);
          conn.on("open", () => {
            conn.send({ type: "peer-list", peers: existingPeers });
          });
        }, 1000);
      });

      peerRef.current = peer;
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("Please allow microphone access to join the call");
    }
  };
  // @ts-ignore
  const handleCall = (call: any, peer: Peer) => {
    const id = call.peer;
    if (callsRef.current.has(id)) return;
    callsRef.current.set(id, call);

    call.on("stream", (remoteStream: MediaStream) => {
      if (audioRefs.current.has(id)) return;
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      document.body.appendChild(audio);
      audioRefs.current.set(id, audio);

      setPeers((p) => [...new Set([...p, id])]);
    });

    call.on("close", () => {
      audioRefs.current.get(id)?.remove();
      audioRefs.current.delete(id);
      callsRef.current.delete(id);
      setPeers((p) => p.filter((x) => x !== id));
    });
  };

  const toggleMute = () => {
    if (!streamRef.current) return;
    const enabled = streamRef.current.getAudioTracks()[0].enabled;
    streamRef.current.getAudioTracks()[0].enabled = !enabled;
    setMuted(!enabled);
  };

  const leave = () => {
    callsRef.current.forEach((c) => c.close());
    streamRef.current?.getTracks().forEach((t) => t.stop());
    peerRef.current?.destroy();
    audioRefs.current.forEach((a) => a.remove());

    // Clean up state
    callsRef.current.clear();
    audioRefs.current.clear();
    setJoined(false);
    setMuted(false);
    setPeers([]);
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="bg-zinc-900 border-4 border-emerald-500 rounded-3xl p-16 text-center max-w-lg w-full mx-4">
          <h1 className="text-6xl font-bold text-emerald-400 mb-8">
            Group Call
          </h1>
          <input
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            className="w-full px-6 py-4 bg-zinc-800 rounded-xl text-2xl mb-6 outline-none focus:ring-4 focus:ring-emerald-500"
            placeholder="Room name"
          />
          <button
            onClick={join}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-3xl py-6 rounded-xl transition-colors"
          >
            Join Room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-10">
      <h1 className="text-4xl md:text-6xl font-bold text-emerald-400 text-center mb-4">
        🎤 Group Call
      </h1>
      <p className="text-2xl md:text-3xl text-emerald-300 text-center mb-12">
        Room: <span className="font-mono">{room}</span> • Online:{" "}
        {peers.length + 1}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 md:gap-10 max-w-7xl mx-auto">
        <div className="bg-zinc-900 border-4 border-emerald-500 rounded-3xl p-6 md:p-10 text-center">
          <div className="w-20 h-20 md:w-32 md:h-32 bg-emerald-600 rounded-full mx-auto mb-4 flex items-center justify-center">
            <span className="text-4xl md:text-6xl">👤</span>
          </div>
          <p className="text-lg md:text-2xl font-semibold">You</p>
          {peerRef.current?.id === room && (
            <span className="text-emerald-400 text-sm md:text-base">Host</span>
          )}
          {muted && (
            <span className="text-red-500 text-2xl md:text-4xl mt-2 inline-block">
              🔇
            </span>
          )}
        </div>

        {peers.map((id) => (
          <div
            key={id}
            className="bg-zinc-800 border-4 border-zinc-700 rounded-3xl p-6 md:p-10 text-center"
          >
            <div className="w-20 h-20 md:w-32 md:h-32 bg-zinc-700 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-4xl md:text-6xl">🔊</span>
            </div>
            <p className="text-sm md:text-xl font-mono truncate">
              {id.slice(-8)}
            </p>
          </div>
        ))}
      </div>

      <div className="fixed bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 flex gap-4 md:gap-8 px-4">
        <button
          onClick={toggleMute}
          className={`px-8 md:px-16 py-4 md:py-8 rounded-3xl text-xl md:text-3xl font-bold transition-colors ${
            muted
              ? "bg-red-600 hover:bg-red-500"
              : "bg-emerald-500 hover:bg-emerald-400 text-black"
          }`}
        >
          {muted ? "🔇 Unmute" : "🎤 Mute"}
        </button>
        <button
          onClick={leave}
          className="px-8 md:px-16 py-4 md:py-8 bg-red-600 hover:bg-red-500 rounded-3xl text-xl md:text-3xl font-bold transition-colors"
        >
          📞 Leave
        </button>
      </div>
    </div>
  );
}
