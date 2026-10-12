'use client';
import { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Mic,
  Square,
  Trash2,
  Send,
  FileText,
  Download,
  Image as ImageIcon,
  Smile,
  X,
  Volume2,
} from 'lucide-react';

// Format seconds into mm:ss
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Format bytes into KB/MB
export function formatBytes(bytes?: number): string {
  if (!bytes || isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// -------------------------------------------------------------
// Audio Player Component
// -------------------------------------------------------------
export function AudioPlayer({
  src,
  duration,
  isSender = false,
}: {
  src: string;
  duration?: number;
  isSender?: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
        setTotalDuration(audio.duration);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [src]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((e) => console.warn('Audio play failed', e));
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const progressPct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 10px',
        borderRadius: 20,
        background: isSender ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.04)',
        border: isSender ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(0, 0, 0, 0.08)',
        minWidth: 210,
        maxWidth: 290,
      }}
    >
      <button
        type="button"
        onClick={togglePlay}
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isSender ? '#ffffff' : '#2563eb',
          color: isSender ? '#2563eb' : '#ffffff',
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
          boxShadow: '0 2px 5px rgba(0, 0, 0, 0.15)',
        }}
      >
        {isPlaying ? <Pause size={15} /> : <Play size={15} style={{ marginLeft: 2 }} />}
      </button>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <input
          type="range"
          min={0}
          max={totalDuration || 100}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          style={{
            width: '100%',
            height: 4,
            accentColor: isSender ? '#ffffff' : '#2563eb',
            cursor: 'pointer',
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10,
            opacity: 0.85,
            fontWeight: 600,
          }}
        >
          <span>{formatDuration(currentTime)}</span>
          <span>{formatDuration(totalDuration || currentTime)}</span>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Audio Voice Recorder Component
// -------------------------------------------------------------
export function AudioRecorder({
  onRecordingComplete,
  onCancel,
}: {
  onRecordingComplete: (blob: Blob, durationSec: number) => void;
  onCancel: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    startRecording();
    return () => {
      cleanup();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access denied:', err);
      alert('Microphone access is required to record voice messages.');
      onCancel();
    }
  };

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  };

  const handleStopAndSend = () => {
    if (!mediaRecorderRef.current) return;
    const duration = seconds;
    mediaRecorderRef.current.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      onRecordingComplete(audioBlob, Math.max(1, duration));
    };
    cleanup();
  };

  const handleDiscard = () => {
    cleanup();
    onCancel();
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: 12,
        padding: '8px 14px',
        width: '100%',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#ef4444',
            boxShadow: '0 0 8px #ef4444',
            animation: 'pulse 1.2s infinite',
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>
          Recording: {formatDuration(seconds)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={handleDiscard}
          title="Discard recording"
          style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            color: '#6b7280',
            padding: '6px 10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <Trash2 size={14} color="#ef4444" />
          <span>Cancel</span>
        </button>

        <button
          type="button"
          onClick={handleStopAndSend}
          title="Send voice note"
          style={{
            background: '#16a34a',
            border: 'none',
            borderRadius: 8,
            color: '#ffffff',
            padding: '6px 12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            fontWeight: 700,
            boxShadow: '0 2px 5px rgba(22, 163, 74, 0.3)',
          }}
        >
          <Send size={13} />
          <span>Send Voice</span>
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Emoji Picker Drawer Component
// -------------------------------------------------------------
const POPULAR_EMOJIS = [
  '😀', '😃', '😄', '😁', '😊', '😍', '🤩', '😎', '🥳', '🙌',
  '👍', '👏', '🙏', '❤️', '🔥', '✨', '⚡', '🎉', '💯', '💎',
  '💍', '💰', '🏷️', '📦', '⭐', '🤝', '📞', '💬', '❓', '✅',
];

export function EmojiPickerPopover({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 54,
        left: 10,
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 12,
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
        zIndex: 100,
        width: 280,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: '1px solid #f3f4f6',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Quick Emojis</span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#9ca3af',
            padding: 2,
          }}
        >
          <X size={14} />
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 6,
          maxHeight: 180,
          overflowY: 'auto',
        }}
      >
        {POPULAR_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            style={{
              fontSize: 20,
              background: '#f9fafb',
              border: '1px solid #f3f4f6',
              borderRadius: 8,
              padding: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 0.1s, background 0.1s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.2)';
              e.currentTarget.style.background = '#eff6ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.background = '#f9fafb';
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Message Media Render Component (Image, File, Audio)
// -------------------------------------------------------------
export function MessageMedia({
  msg,
  isSender = false,
}: {
  msg: {
    message_type?: string;
    file_url?: string | null;
    file_name?: string | null;
    file_size?: number | null;
    duration_seconds?: number | null;
  };
  isSender?: boolean;
}) {
  const [showLightbox, setShowLightbox] = useState(false);

  if (!msg.file_url) return null;

  const type = msg.message_type || (
    msg.file_url.match(/\.(png|jpg|jpeg|gif|webp)$/i)
      ? 'image'
      : msg.file_url.match(/\.(mp4|webm|mov|mkv|avi)$/i)
      ? 'video'
      : msg.file_url.match(/\.(mp3|wav|ogg)$/i)
      ? 'audio'
      : 'file'
  );

  if (type === 'audio') {
    return (
      <div style={{ marginTop: 6, marginBottom: 4 }}>
        <AudioPlayer src={msg.file_url} duration={msg.duration_seconds || undefined} isSender={isSender} />
      </div>
    );
  }

  if (type === 'video') {
    return (
      <div style={{ marginTop: 6, marginBottom: 4 }}>
        <video
          src={msg.file_url}
          controls
          playsInline
          preload="metadata"
          style={{
            maxWidth: 280,
            maxHeight: 220,
            borderRadius: 8,
            border: isSender ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid #e5e7eb',
            background: '#000000',
            display: 'block',
          }}
        />
        {msg.file_name && (
          <div style={{ fontSize: 10, marginTop: 3, opacity: 0.8, color: isSender ? '#ffffff' : '#6b7280' }}>
            📹 {msg.file_name} {msg.file_size ? `(${formatBytes(msg.file_size)})` : ''}
          </div>
        )}
      </div>
    );
  }

  if (type === 'image') {
    return (
      <div style={{ marginTop: 6, marginBottom: 4 }}>
        <img
          src={msg.file_url}
          alt={msg.file_name || 'Uploaded image'}
          onClick={() => setShowLightbox(true)}
          style={{
            maxWidth: 220,
            maxHeight: 180,
            borderRadius: 8,
            objectFit: 'cover',
            cursor: 'pointer',
            border: isSender ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid #e5e7eb',
            display: 'block',
          }}
        />
        {showLightbox && (
          <div
            onClick={() => setShowLightbox(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: 20,
            }}
          >
            <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
              <button
                type="button"
                onClick={() => setShowLightbox(false)}
                style={{
                  position: 'absolute',
                  top: -12,
                  right: -12,
                  background: '#ffffff',
                  border: 'none',
                  borderRadius: '50%',
                  width: 30,
                  height: 30,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                }}
              >
                <X size={18} />
              </button>
              <img
                src={msg.file_url}
                alt="Enlarged view"
                style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 8, objectFit: 'contain' }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Generic File Attachment
  return (
    <div
      style={{
        marginTop: 6,
        marginBottom: 4,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: isSender ? 'rgba(255, 255, 255, 0.2)' : '#f3f4f6',
        padding: '8px 12px',
        borderRadius: 8,
        border: isSender ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid #e5e7eb',
        maxWidth: 240,
      }}
    >
      <FileText size={20} color={isSender ? '#ffffff' : '#4b5563'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: isSender ? '#ffffff' : '#111827',
          }}
        >
          {msg.file_name || 'Attachment'}
        </div>
        {msg.file_size && (
          <div style={{ fontSize: 10, opacity: 0.8, color: isSender ? '#ffffff' : '#6b7280' }}>
            {formatBytes(msg.file_size)}
          </div>
        )}
      </div>
      <a
        href={msg.file_url}
        download={msg.file_name || 'download'}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          background: isSender ? '#ffffff' : '#2563eb',
          color: isSender ? '#2563eb' : '#ffffff',
          borderRadius: 6,
          padding: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
        }}
      >
        <Download size={14} />
      </a>
    </div>
  );
}
