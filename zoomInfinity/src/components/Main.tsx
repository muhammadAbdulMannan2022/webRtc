"use client";

import React, { useState, useEffect, useRef } from "react";
import Peer from "peerjs";
import { Mic, MicOff, PhoneOff, Users, Volume2 } from "lucide-react";

interface PeerCall {
  peer: string;
  call: MediaConnection;
}

export default function GroupAudioCall() {
  const [roomName, setRoomName] = useState("party2025");
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState("Enter a room name and join");
  const [peers, setPeers] = useState<Map<string, MediaStream>>(new Map());
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());

  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callsRef = useRef<Map<string, MediaConnection>>(new Map());
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());

  const myIdRef = useRef<string>("");

  // Join Room Logic (Exact same as your fixed 2025 HTML version)
  const joinRoom = async () => {
    if (!roomName.trim()) return;

    setIsJoined(true);
    setStatus("Connecting...");

    // Step 1: Try to become host using room name as ID
    const peer = new Peer(roomName, {
      config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
    });

    peer.on("open", (id) => {
      myIdRef.current = id;
      setStatus(`You are the host of "${roomName}"`);
      getMicrophone();
    });

    peer.on("error", (err) => {
      if (err.type === "unavailable-id") {
        // Room taken → become guest
        peer.destroy();
        const guestPeer = new Peer();

        guestPeer.on("open", async (guestId) => {
          myIdRef.current = guestId;
          setStatus(`Joining "${roomName}"...`);
          await getMicrophone();
          if (localStreamRef.current) {
            const call = guestPeer.call(roomName, localStreamRef.current);
            setupCall(call);
          }
        });

        setupPeerEvents(guestPeer);
      }
    });

    setupPeerEvents(peer);
    peerRef.current = peer;
  };

  const setupPeerEvents = (peer: Peer) => {
    peer.on("call", (call) => {
      console.log("Incoming call from:", call.peer);

      if (localStreamRef.current) {
        call.answer(localStreamRef.current);
      }
      setupCall(call);

      // HOST: Forward all existing streams to new peer
      if (peer.id === roomName) {
        callsRef.current.forEach((existingCall, existingId) => {
          if (existingId !== call.peer && existingCall.remoteStream) {
            peer.call(call.peer, existingCall.remoteStream);
          }
        });
        if (localStreamRef.current) {
          peer.call(call.peer, localStreamRef.current);
        }
      }
    });
  };

  const setupCall = (call: MediaConnection) => {
    const peerId = call.peer;
    if (callsRef.current.has(peerId)) return;

    callsRef.current.set(peerId, call);

    call.on("stream", (remoteStream) => {
      createAudioElement(peerId, remoteStream);
      setPeers((prev) => new Map(prev).set(peerId, remoteStream));

      // GUEST: If received stream from non-host → call them back
      if (peerRef.current?.id !== roomName && peerId !== roomName) {
        setTimeout(() => {
          if (localStreamRef.current && call.open) {
            const backCall = peerRef.current!.call(
              peerId,
              localStreamRef.current
            );
            setupCall(backCall);
          }
        }, 1000);
      }
    });

    call.on("close", () => {
      callsRef.current.delete(peerId);
      audioRefs.current.get(peerId)?.remove();
      audioRefs.current.delete(peerId);
      analysersRef.current.get(peerId)?.disconnect();
      analysersRef.current.delete(peerId);
      setPeers((prev) => {
        const updated = new Map(prev);
        updated.delete(peerId);
        return updated;
      });
    });
  };

  const getMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
    } catch (err) {
      setStatus("Microphone access denied");
      console.error(err);
    }
  };

  const createAudioElement = (peerId: string, stream: MediaStream) => {
    if (audioRefs.current.has(peerId)) return;

    const audio = document.createElement("audio");
    audio.srcObject = stream;
    audio.autoplay = true;
    document.body.appendChild(audio);
    audioRefs.current.set(peerId, audio);

    // Speaking detection
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);

      const detectSpeaking = () => {
        analyser.getByteFrequencyData(data);
        const volume = data.reduce((a, b) => a + b) / data.length;
        setSpeaking((prev) => {
          const updated = new Set(prev);
          if (volume > 25) updated.add(peerId);
          else updated.delete(peerId);
          return updated;
        });
        if (audioRefs.current.has(peerId))
          requestAnimationFrame(detectSpeaking);
      };
      detectSpeaking();
      analysersRef.current.set(peerId, analyser);
    } catch (e) {}
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const enabled = localStreamRef.current.getAudioTracks()[0].enabled;
    localStreamRef.current.getAudioTracks()[0].enabled = !enabled;
    setIsMuted(!enabled);
  };

  const leaveRoom = () => {
    callsRef.current.forEach((call) => call.close());
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    peerRef.current?.destroy();
    audioRefs.current.forEach((a) => a.remove());
    setIsJoined(false);
    setPeers(new Map());
    setSpeaking(new Set());
    setStatus("Enter room name and join");
  };

  const totalUsers = peers.size + 1;

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="bg-zinc-900 border-4 border-emerald-500 rounded-3xl p-12 max-w-md w-full shadow-2xl">
          <h1 className="text-4xl font-bold text-emerald-400 mb-8 text-center">
            Group Audio Call
          </h1>
          <input
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="Room name"
            className="w-full px-6 py-4 bg-zinc-800 rounded-xl text-xl focus:outline-none focus:ring-4 focus:ring-emerald-500 mb-6"
            onKeyPress={(e) => e.key === "Enter" && joinRoom()}
          />
          <button
            onClick={joinRoom}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xl py-5 rounded-xl transition"
          >
            Join Room
          </button>
          <p className="text-center text-zinc-500 mt-6 text-sm">
            Fixed 2025 • Everyone connects automatically
            <br />
            Just share the room name!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-emerald-400 mb-2">
            Group Audio Call
          </h1>
          <p className="text-2xl text-emerald-300">
            Room: <span className="font-mono">{roomName}</span> • Online:{" "}
            {totalUsers} {totalUsers === 1 ? "person" : "people"}
          </p>
          <p className="text-lg text-zinc-400 mt-2">{status}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-12">
          {/* You (Local User) */}
          <div className="bg-zinc-900 border-4 border-emerald-500 rounded-3xl p-8 flex flex-col items-center justify-center transform transition-all hover:scale-105">
            <div className="w-20 h-20 bg-emerald-600 rounded-full flex items-center justify-center mb-4">
              <Users className="w-10 h-10" />
            </div>
            <p className="text-xl font-bold text-emerald-400">
              You {peerRef.current?.id === roomName && "(Host)"}
            </p>
            {isMuted && <MicOff className="w-6 h-6 text-red-500 mt-2" />}
          </div>

          {/* Remote Peers */}
          {Array.from(peers.keys()).map((peerId) => (
            <div
              key={peerId}
              className={`bg-zinc-800 border-4 rounded-3xl p-8 flex flex-col items-center justify-center transition-all ${
                speaking.has(peerId)
                  ? "border-emerald-500 shadow-2xl shadow-emerald-500/50 scale-110"
                  : "border-zinc-700"
              }`}
            >
              <div className="w-20 h-20 bg-zinc-700 rounded-full flex items-center justify-center mb-4">
                <Volume2
                  className={`w-10 h-10 transition-all ${
                    speaking.has(peerId) ? "text-emerald-400" : "text-zinc-500"
                  }`}
                />
              </div>
              <p className="text-lg font-semibold text-zinc-300">
                {peerId.slice(-8)}
              </p>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-6">
          <button
            onClick={toggleMute}
            className={`flex items-center gap-3 px-10 py-5 rounded-xl font-bold text-xl transition ${
              isMuted
                ? "bg-red-600 hover:bg-red-500"
                : "bg-emerald-500 hover:bg-emerald-400 text-black"
            }`}
          >
            {isMuted ? (
              <MicOff className="w-7 h-7" />
            ) : (
              <Mic className="w-7 h-7" />
            )}
            {isMuted ? "Unmute" : "Mute"}
          </button>

          <button
            onClick={leaveRoom}
            className="flex items-center gap-3 px-10 py-5 bg-red-600 hover:bg-red-500 rounded-xl font-bold text-xl transition"
          >
            <PhoneOff className="w-7 h-7" />
            Leave Room
          </button>
        </div>

        <p className="text-center text-zinc-600 text-sm mt-12">
          Fixed 2025 • Auto-connect all peers • No server needed
        </p>
      </div>
    </div>
  );
}
