import React, { useState, useEffect, useRef } from "react";
import {
  Video,
  FileAudio,
  Upload,
  Plus,
  Trash2,
  Download,
  Send,
  MessageSquare,
  Clipboard,
  CheckSquare,
  HelpCircle,
  Award,
  BookOpen,
  Globe,
  FileText,
  Loader2,
  Check,
  ChevronRight,
  Share2
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000/api";

function SymbolBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animationFrameId;

    const resizeCanvas = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const numSymbols = 80;
    const symbols = [];

    // Create initial symbols
    for (let i = 0; i < numSymbols; i++) {
      const duration = Math.floor(Math.random() * 1500) + 1000;
      const idleDuration = Math.floor(Math.random() * 2000) + 500;
      symbols.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        char: chars[Math.floor(Math.random() * chars.length)],
        fontSize: Math.floor(Math.random() * 11) + 11,
        startTime: Date.now() - Math.random() * (duration + idleDuration),
        duration,
        idleDuration,
        color: Math.random() > 0.4 ? "rgba(255, 255, 255, 1.0)" : "rgba(99, 102, 241, 1.0)"
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = Date.now();

      symbols.forEach((symbol) => {
        const totalDuration = symbol.duration + symbol.idleDuration;
        let elapsed = now - symbol.startTime;

        if (elapsed > totalDuration) {
          symbol.x = Math.random() * canvas.width;
          symbol.y = Math.random() * canvas.height;
          symbol.char = chars[Math.floor(Math.random() * chars.length)];
          symbol.fontSize = Math.floor(Math.random() * 11) + 11;
          symbol.duration = Math.floor(Math.random() * 1500) + 1000;
          symbol.idleDuration = Math.floor(Math.random() * 2000) + 500;
          symbol.startTime = now;
          elapsed = 0;
        }

        if (elapsed < symbol.duration) {
          const fadeInTime = symbol.duration * 0.3;
          const fadeOutTime = symbol.duration * 0.3;
          let opacity = 0;

          if (elapsed < fadeInTime) {
            opacity = elapsed / fadeInTime;
          } else if (elapsed < symbol.duration - fadeOutTime) {
            opacity = 1.0;
          } else {
            opacity = (symbol.duration - elapsed) / fadeOutTime;
          }
          opacity = Math.max(0, Math.min(1.0, opacity));

          ctx.font = `${symbol.fontSize}px 'JetBrains Mono', monospace`;
          ctx.shadowBlur = 20;
          ctx.shadowColor = symbol.color.includes("99, 102, 241") 
            ? `rgba(99, 102, 241, ${opacity * 0.95})` 
            : `rgba(255, 255, 255, ${opacity * 0.95})`;
          ctx.fillStyle = symbol.color.replace("1.0", (opacity * 1.0).toFixed(3));
          ctx.fillText(symbol.char, symbol.x, symbol.y);
          ctx.shadowBlur = 0;
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ 
        position: "absolute", 
        top: 0, 
        left: 0, 
        width: "100%", 
        height: "100%", 
        zIndex: 0, 
        pointerEvents: "none" 
      }} 
    />
  );
}

export default function App() {
  // Core Application State
  const [meetings, setMeetings] = useState([]);
  const [activeMeeting, setActiveMeeting] = useState(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form Inputs
  const [sourceType, setSourceType] = useState("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [language, setLanguage] = useState("english");
  const [uploadProgress, setUploadProgress] = useState(null); // 'uploading' | 'processing' | null

  // Tabs for Selected Meeting Workspace
  const [activeTab, setActiveTab] = useState("summary"); // summary | action_items | transcript | chat

  // Chat / RAG State
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState({});
  const [chatLoading, setChatLoading] = useState(false);

  // Checked state for tasks
  const [checkedTasks, setCheckedTasks] = useState({});

  // Refs
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // Initialize
  useEffect(() => {
    fetchMeetings(true);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Poll status when active meeting is processing
  useEffect(() => {
    if (activeMeeting && (activeMeeting.status === "queued" || activeMeeting.status === "processing")) {
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(() => {
          pollMeetingStatus(activeMeeting.id);
        }, 3000);
      }
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  }, [activeMeeting]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, activeTab]);

  const fetchMeetings = async (selectFirst = false) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/meetings`);
      const data = await res.json();
      setMeetings(data);
      if (selectFirst && data.length > 0) {
        handleSelectMeeting(data[0].id);
      } else if (data.length === 0) {
        setIsIngesting(true);
      }
    } catch (e) {
      console.error("Failed to fetch meetings:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMeeting = async (id) => {
    setIsIngesting(false);
    setActiveTab("summary");
    try {
      const res = await fetch(`${API_BASE}/meetings/${id}`);
      const data = await res.json();
      setActiveMeeting(data);
    } catch (e) {
      console.error("Failed to fetch meeting detail:", e);
    }
  };

  const pollMeetingStatus = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/meetings/${id}`);
      const data = await res.json();
      setActiveMeeting(data);
      
      setMeetings(prev => prev.map(m => m.id === id ? { ...m, status: data.status, title: data.title } : m));

      if (data.status === "completed" || data.status === "failed") {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        fetchMeetings(false);
      }
    } catch (e) {
      console.error("Error polling status:", e);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleProcessSubmit = async (e) => {
    e.preventDefault();
    setUploadProgress("uploading");
    let sourcePath = "";

    try {
      if (sourceType === "file") {
        if (!selectedFile) {
          alert("Please upload a local audio/video file");
          setUploadProgress(null);
          return;
        }
        
        const formData = new FormData();
        formData.append("file", selectedFile);
        
        const uploadRes = await fetch(`${API_BASE}/upload`, {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) throw new Error("Upload failed");
        const uploadData = await uploadRes.json();
        sourcePath = uploadData.filepath;
      } else {
        if (!youtubeUrl) {
          alert("Please provide a YouTube URL");
          setUploadProgress(null);
          return;
        }
        sourcePath = youtubeUrl;
      }

      setUploadProgress("processing");

      const processForm = new FormData();
      processForm.append("source", sourcePath);
      processForm.append("language", language);

      const processRes = await fetch(`${API_BASE}/process`, {
        method: "POST",
        body: processForm,
      });
      if (!processRes.ok) throw new Error("Failed to start processing");
      const processData = await processRes.json();
      
      handleSelectMeeting(processData.meeting_id);
      fetchMeetings(false);
      
      setYoutubeUrl("");
      setSelectedFile(null);
    } catch (error) {
      console.error(error);
      alert(`Error starting pipeline: ${error.message}`);
    } finally {
      setUploadProgress(null);
    }
  };

  const handleDeleteMeeting = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Delete this video index?")) return;
    
    try {
      const res = await fetch(`${API_BASE}/meetings/${id}`, { method: "DELETE" });
      if (res.ok) {
        setActiveMeeting(null);
        setMeetings(prev => prev.filter(m => m.id !== id));
        const remaining = meetings.filter(m => m.id !== id);
        if (remaining.length > 0) {
          handleSelectMeeting(remaining[0].id);
        } else {
          setIsIngesting(true);
        }
      }
    } catch (e) {
      console.error("Failed to delete meeting:", e);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatMessage.trim() || chatLoading || !activeMeeting) return;

    const userMsg = chatMessage.trim();
    setChatMessage("");

    const currentHistory = chatHistory[activeMeeting.id] || [];
    const updatedHistory = [...currentHistory, { sender: "user", text: userMsg }];
    setChatHistory({
      ...chatHistory,
      [activeMeeting.id]: updatedHistory
    });

    setChatLoading(true);

    try {
      const res = await fetch(`${API_BASE}/meetings/${activeMeeting.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMsg })
      });
      if (!res.ok) throw new Error("Q&A request failed");
      const data = await res.json();
      
      setChatHistory(prev => ({
        ...prev,
        [activeMeeting.id]: [...updatedHistory, { sender: "assistant", text: data.answer }]
      }));
    } catch (err) {
      console.error("Chat error:", err);
      setChatHistory(prev => ({
        ...prev,
        [activeMeeting.id]: [...updatedHistory, { sender: "assistant", text: "Error loading answer. Try again." }]
      }));
    } finally {
      setChatLoading(false);
    }
  };

  const handleToggleTask = (idx) => {
    setCheckedTasks(prev => {
      const meetingChecks = prev[activeMeeting.id] || {};
      return {
        ...prev,
        [activeMeeting.id]: {
          ...meetingChecks,
          [idx]: !meetingChecks[idx]
        }
      };
    });
  };

  const handleExport = (format) => {
    if (!activeMeeting) return;
    window.open(`${API_BASE}/meetings/${activeMeeting.id}/export/${format}`);
  };

  const handleShareChat = () => {
    if (!activeMeeting) return;
    const shareUrl = `${window.location.origin}/share/${activeMeeting.id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  // Helper Parsers
  const parseActionItems = (text) => {
    if (!text || text.includes("No action items found") || text.includes("None found")) return [];
    return text.split("\n")
      .map(line => line.trim())
      .filter(line => line && (line.startsWith("-") || line.startsWith("*") || line.match(/^\d+\./)))
      .map((line, idx) => {
        let content = line.replace(/^[-*]\s*/, "").replace(/^\d+\.\s*/, "");
        let owner = "Not specified";
        let deadline = "Not specified";
        
        const ownerMatch = content.match(/Owner:\s*([^,|)\n]+)/i) || content.match(/Responsible:\s*([^,|)\n]+)/i);
        if (ownerMatch) owner = ownerMatch[1].trim();

        const deadlineMatch = content.match(/Deadline:\s*([^,|)\n]+)/i) || content.match(/Due:\s*([^,|)\n]+)/i);
        if (deadlineMatch) deadline = deadlineMatch[1].trim();

        let cleanText = content
          .replace(/[-–]?\s*Owner:\s*[^,|)\n]+/i, "")
          .replace(/[-–]?\s*Deadline:\s*[^,|)\n]+/i, "")
          .replace(/\(Owner:[^)]+\)/i, "")
          .replace(/\(Deadline:[^)]+\)/i, "")
          .trim();

        return {
          id: idx,
          text: (cleanText || content).replace(/\*\*/g, ""),
          owner,
          deadline
        };
      });
  };

  const parseBulletList = (text, typeName) => {
    if (!text || text.includes(`No ${typeName} found`) || text.includes("None found")) return [];
    return text.split("\n")
      .map(line => line.trim())
      .filter(line => line && (line.startsWith("-") || line.startsWith("*") || line.match(/^\d+\./)))
      .map(line => line.replace(/^[-*]\s*/, "").replace(/^\d+\.\s*/, "").replace(/\*\*/g, ""));
  };

  const actionItems = parseActionItems(activeMeeting?.action_items || "");
  const decisionItems = parseBulletList(activeMeeting?.key_decisions || "", "decisions");
  const questionItems = parseBulletList(activeMeeting?.open_questions || "", "questions");
  const chatMessages = chatHistory[activeMeeting?.id] || [
    { sender: "assistant", text: "Ask me anything about this video. I will search the vector database and retrieve accurate answers." }
  ];

  return (
    <div className="app-layout" style={{ gridTemplateColumns: "250px 1fr" }}>
      
      {/* Simplified Left Sidebar */}
      <aside className="sidebar" style={{ background: "var(--bg-sidebar)", padding: "1rem" }}>
        {/* Decorative Floating Bubbles */}
        <div className="sidebar-bubble bubble-1"></div>
        <div className="sidebar-bubble bubble-2"></div>
        <div className="sidebar-bubble bubble-3"></div>
        <div className="sidebar-bubble bubble-4"></div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.5rem", padding: "0 0.5rem" }}>
          <img 
            src="/hero.png" 
            alt="Flipbook AI Logo" 
            style={{ 
              width: "20px", 
              height: "20px", 
              objectFit: "contain", 
              filter: "invert(0.95) contrast(1.1)" 
            }} 
          />
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "1rem" }}>Flipbook AI</span>
        </div>

        <button 
          className="new-processing-btn" 
          onClick={() => setIsIngesting(true)}
          style={{ width: "100%", margin: "0 0 1rem 0", background: "#fff", color: "#000" }}
        >
          <Plus size={14} />
          Ingest Video
        </button>

        <div className="sidebar-nav-section" style={{ padding: "0.5rem", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em" }}>Recent Chats</div>
        <div className="recent-videos-scroll" style={{ marginTop: "0.5rem" }}>
          {meetings.map((m) => (
            <div
              key={m.id}
              className={`recent-video-link ${activeMeeting?.id === m.id && !isIngesting ? "active" : ""}`}
              onClick={() => handleSelectMeeting(m.id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "0.5rem" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", overflow: "hidden" }}>
                <MessageSquare size={11} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{m.title}</span>
              </div>
              <button 
                className="delete-btn" 
                onClick={(e) => handleDeleteMeeting(m.id, e)} 
                style={{ padding: 2, background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                title="Delete"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          {meetings.length === 0 && (
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", padding: "0 0.5rem" }}>No videos indexed.</span>
          )}
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="main-wrapper" style={{ background: "var(--bg-main)", position: "relative", overflow: "hidden" }}>
        <SymbolBackground />
        
        {/* Simple top info bar */}
        <header className="top-navbar" style={{ background: "transparent", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            {isIngesting ? "" : activeMeeting ? activeMeeting.title : ""}
          </span>
          {!isIngesting && activeMeeting?.status === "completed" && (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", position: "relative" }}>
              <button className="btn-secondary" onClick={handleShareChat} style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}>
                <Share2 size={11} /> Share
              </button>
              <button className="btn-secondary" onClick={() => handleExport("txt")} style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}>
                Export TXT
              </button>
              <button className="btn-secondary" onClick={() => handleExport("md")} style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}>
                Export MD
              </button>

              {shareCopied && (
                <div style={{ 
                  position: "absolute", 
                  top: "120%", 
                  right: 0, 
                  background: "#10B981", 
                  color: "#fff", 
                  fontSize: "0.7rem", 
                  padding: "0.25rem 0.5rem", 
                  borderRadius: "4px", 
                  boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
                  whiteSpace: "nowrap",
                  zIndex: 10
                }}>
                  Link copied to clipboard!
                </div>
              )}
            </div>
          )}
        </header>

        <div className="workspace-scrollport" style={{ padding: "1.5rem" }}>
          {(isIngesting || !activeMeeting) ? (
              /* CHATGPT-STYLE UPLOAD INTERFACE */
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "65vh", maxWidth: 600, margin: "0 auto" }}>
                
                {/* Logo with Y-axis spin */}
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.5rem" }}>
                  <img 
                    src="/hero.png" 
                    alt="Flipbook AI Logo" 
                    className="spin-hover-image" 
                  />
                </div>

                <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "1.4rem", marginBottom: "1.5rem", textAlign: "center" }}>
                  What video would you like to analyze?
                </h2>

                <form onSubmit={handleProcessSubmit} style={{ width: "100%" }}>
                  <div style={{ 
                    background: "rgba(255, 255, 255, 0.03)", 
                    border: "1px solid var(--border-muted)", 
                    borderRadius: "24px", 
                    padding: "0.5rem 0.75rem", 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "0.5rem",
                    boxShadow: "0 8px 30px rgba(0, 0, 0, 0.3)"
                  }}>
                    {/* Hidden File Input */}
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange}
                      accept="audio/*,video/*"
                      style={{ display: "none" }}
                    />
                    
                    {/* Paperclip Button */}
                    <button 
                      type="button" 
                      className="icon-button" 
                      onClick={() => fileInputRef.current?.click()}
                      style={{ color: selectedFile ? "var(--accent-primary)" : "var(--text-secondary)", padding: "0.5rem" }}
                      title="Upload Local File"
                    >
                      <Upload size={15} />
                    </button>

                    {/* Unified text / file bar */}
                    {selectedFile ? (
                      <div style={{ 
                        flex: 1, 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "space-between",
                        background: "rgba(255, 255, 255, 0.05)",
                        padding: "0.35rem 0.75rem",
                        borderRadius: "16px",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        marginRight: "0.5rem"
                      }}>
                        <span style={{ fontSize: "0.82rem", color: "var(--text-primary)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
                          📎 {selectedFile.name}
                        </span>
                        <button 
                          type="button" 
                          onClick={() => setSelectedFile(null)}
                          style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                        >
                          <Trash2 size={12} style={{ color: "var(--accent-danger)" }} />
                        </button>
                      </div>
                    ) : (
                      <input 
                        type="url" 
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        placeholder="Paste YouTube video URL here..." 
                        style={{ 
                          flex: 1, 
                          background: "transparent", 
                          border: "none", 
                          outline: "none", 
                          color: "var(--text-primary)", 
                          fontSize: "0.9rem",
                          padding: "0.5rem 0"
                        }}
                      />
                    )}

                    {/* Language Selector Capsule */}
                    <button 
                      type="button"
                      onClick={() => setLanguage(prev => prev === "english" ? "hinglish" : "english")}
                      style={{ 
                        background: "rgba(255, 255, 255, 0.04)", 
                        border: "1px solid var(--border-muted)", 
                        borderRadius: "16px", 
                        padding: "0.35rem 0.75rem", 
                        color: "var(--text-secondary)", 
                        fontSize: "0.78rem", 
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        transition: "var(--transition-fast)"
                      }}
                    >
                      <Globe size={11} />
                      <span style={{ textTransform: "capitalize" }}>{language}</span>
                    </button>

                    {/* Submit Button */}
                    <button 
                      type="submit" 
                      className="luxury-chat-submit" 
                      disabled={uploadProgress !== null}
                      style={{ 
                        width: "34px", 
                        height: "34px", 
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: (selectedFile || youtubeUrl) ? "var(--text-primary)" : "rgba(255, 255, 255, 0.04)",
                        color: (selectedFile || youtubeUrl) ? "var(--bg-main)" : "var(--text-muted)",
                        cursor: (selectedFile || youtubeUrl) ? "pointer" : "default",
                        transition: "all var(--transition-fast)"
                      }}
                    >
                      {uploadProgress ? (
                        <Loader2 className="spinner" size={12} style={{ animation: "spin 1s infinite linear" }} />
                      ) : (
                        <Send size={12} />
                      )}
                    </button>
                  </div>
                </form>

                {uploadProgress && (
                  <div style={{ marginTop: "1rem" }}>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      {uploadProgress === "uploading" ? "Uploading media file..." : "Building database index..."}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* SELECTED WORKSPACE */
              <div>
              {/* If meeting is loading / processing */}
              {(activeMeeting.status === "queued" || activeMeeting.status === "processing") && (
                <div className="premium-card" style={{ maxWidth: 500, margin: "4rem auto", textAlign: "center", padding: "3rem 2rem" }}>
                  <Loader2 className="spinner" size={32} style={{ animation: "spin 1s infinite linear", margin: "0 auto 1.5rem auto", color: "var(--accent-primary)" }} />
                  <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "1.1rem" }}>Processing RAG Index</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "0.5rem" }}>
                    We are transcribing speech, running summarizations, and building vector tables. This will refresh automatically.
                  </p>
                </div>
              )}

              {/* If meeting failed */}
              {activeMeeting.status === "failed" && (
                <div className="premium-card" style={{ maxWidth: 500, margin: "4rem auto", borderColor: "rgba(239,68,68,0.2)" }}>
                  <h3 style={{ color: "var(--accent-danger)", fontSize: "1.1rem", marginBottom: "0.5rem" }}>Ingestion Failed</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", marginBottom: "1rem" }}>
                    An error occurred during audio extraction or Whispering:
                  </p>
                  <pre style={{ background: "rgba(0,0,0,0.4)", padding: "0.85rem", borderRadius: "6px", fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent-danger)", overflowX: "auto" }}>
                    {activeMeeting.error || "Unknown pipeline error"}
                  </pre>
                  <button className="new-processing-btn" style={{ marginTop: "1rem" }} onClick={() => setIsIngesting(true)}>
                    Try Again
                  </button>
                </div>
              )}

              {/* Ingestion Completed Workspace */}
              {activeMeeting.status === "completed" && (
                <div>
                  
                  {/* Clean Tab selectors */}
                  <div className="luxury-tabs-bar" style={{ marginBottom: "1.25rem" }}>
                    <button className={`luxury-tab-trigger ${activeTab === "summary" ? "active" : ""}`} onClick={() => setActiveTab("summary")}>
                      <BookOpen size={13} /> Summary
                    </button>
                    <button className={`luxury-tab-trigger ${activeTab === "action_items" ? "active" : ""}`} onClick={() => setActiveTab("action_items")}>
                      <CheckSquare size={13} /> Checklist ({actionItems.length})
                    </button>
                    <button className={`luxury-tab-trigger ${activeTab === "transcript" ? "active" : ""}`} onClick={() => setActiveTab("transcript")}>
                      <FileText size={13} /> Transcript
                    </button>
                    <button className={`luxury-tab-trigger ${activeTab === "chat" ? "active" : ""}`} onClick={() => setActiveTab("chat")}>
                      <MessageSquare size={13} /> AI Chat (RAG)
                    </button>
                  </div>

                  {/* Tab Panels */}
                  <div className="tab-pane-content">
                    
                    {/* Summary and Findings */}
                    {activeTab === "summary" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <div className="premium-card">
                          <h4 style={{ fontSize: "0.9rem", color: "var(--accent-primary)", marginBottom: "0.75rem", borderBottom: "1px solid rgba(255,255,255,0.03)", paddingBottom: "0.4rem" }}>
                            Executive Summary
                          </h4>
                          <ul className="bullet-points">
                            {activeMeeting.summary.split("\n")
                              .map(line => line.trim())
                              .filter(line => line && (line.startsWith("-") || line.startsWith("*") || line.match(/^\d+\./)))
                              .map((line, idx) => (
                                <li key={idx} style={{ fontSize: "0.88rem", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                                  {line.replace(/^[-*]\s*/, "").replace(/^\d+\.\s*/, "").replace(/\*\*/g, "")}
                                </li>
                              ))
                            }
                            {!activeMeeting.summary.includes("-") && !activeMeeting.summary.includes("*") && (
                              <p style={{ fontSize: "0.88rem", whiteSpace: "pre-wrap", lineHeight: "1.5" }}>{activeMeeting.summary.replace(/\*\*/g, "")}</p>
                            )}
                          </ul>
                        </div>

                        {decisionItems.length > 0 && (
                          <div className="premium-card">
                            <h4 style={{ fontSize: "0.9rem", color: "var(--accent-success)", marginBottom: "0.75rem", borderBottom: "1px solid rgba(255,255,255,0.03)", paddingBottom: "0.4rem" }}>
                              Key Decisions
                            </h4>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                              {decisionItems.map((dec, idx) => (
                                <div key={idx} style={{ fontSize: "0.85rem", color: "var(--text-primary)", display: "flex", gap: "0.5rem" }}>
                                  <span style={{ color: "var(--accent-success)" }}>✓</span>
                                  <span>{dec}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {questionItems.length > 0 && (
                          <div className="premium-card">
                            <h4 style={{ fontSize: "0.9rem", color: "var(--accent-warning)", marginBottom: "0.75rem", borderBottom: "1px solid rgba(255,255,255,0.03)", paddingBottom: "0.4rem" }}>
                              Open Questions
                            </h4>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                              {questionItems.map((q, idx) => (
                                <div key={idx} style={{ fontSize: "0.85rem", color: "var(--text-primary)", display: "flex", gap: "0.5rem" }}>
                                  <span style={{ color: "var(--accent-warning)" }}>?</span>
                                  <span>{q}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Items checklist */}
                    {activeTab === "action_items" && (
                      <div className="premium-card">
                        <h4 style={{ fontSize: "0.9rem", color: "var(--accent-primary)", marginBottom: "1rem", borderBottom: "1px solid rgba(255,255,255,0.03)", paddingBottom: "0.4rem" }}>
                          Tasks Checklist
                        </h4>
                        
                        <div className="action-check-list">
                          {actionItems.length === 0 ? (
                            <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", textAlign: "center", padding: "1rem" }}>
                              No actionable items found.
                            </p>
                          ) : (
                            actionItems.map((item) => {
                              const isChecked = !!checkedTasks[activeMeeting.id]?.[item.id];
                              return (
                                <div 
                                  key={item.id}
                                  className={`action-check-row ${isChecked ? "checked" : ""}`}
                                  style={{ padding: "0.4rem 0.5rem" }}
                                >
                                  <div className="action-check-box" onClick={() => handleToggleTask(item.id)}>
                                    <Check size={10} />
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                                    <span className="action-check-label" style={{ fontSize: "0.85rem" }}>{item.text}</span>
                                    <div style={{ display: "flex", gap: "0.5rem" }}>
                                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>👤 {item.owner}</span>
                                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>⏰ {item.deadline}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {/* Full Transcript */}
                    {activeTab === "transcript" && (
                      <div className="transcript-pane" style={{ maxHeight: "calc(100vh - 220px)", padding: "1rem" }}>
                        {activeMeeting.transcript || "No transcript available."}
                      </div>
                    )}

                    {/* RAG Chat interface */}
                    {activeTab === "chat" && (
                      <div className="luxury-chat-box" style={{ height: "calc(100vh - 220px)" }}>
                        <div className="luxury-chat-messages">
                          {chatMessages.map((msg, idx) => (
                            <div key={idx} className={`chat-bubble-row ${msg.sender}`}>
                              <span className="chat-bubble-header">{msg.sender === "user" ? "User" : "Flipbook AI"}</span>
                              <div className="luxury-chat-bubble" style={{ fontSize: "0.88rem" }}>
                                {msg.text.split("\n").map((p, pi) => <p key={pi} style={{ marginBottom: "0.25rem" }}>{p}</p>)}
                              </div>
                            </div>
                          ))}
                          {chatLoading && (
                            <div className="chat-bubble-row assistant">
                              <span className="chat-bubble-header">Flipbook AI</span>
                              <div className="luxury-chat-bubble">
                                <div className="chat-loading">
                                  <div className="chat-loading-dot"></div>
                                  <div className="chat-loading-dot"></div>
                                  <div className="chat-loading-dot"></div>
                                </div>
                              </div>
                            </div>
                          )}
                          <div ref={chatEndRef} />
                        </div>

                        <form onSubmit={handleSendChat} className="luxury-chat-form">
                          <input
                            type="text"
                            value={chatMessage}
                            onChange={(e) => setChatMessage(e.target.value)}
                            placeholder="Ask a question about this video..."
                            className="luxury-chat-input"
                          />
                          <button type="submit" className="luxury-chat-submit" disabled={chatLoading}>
                            <Send size={14} />
                          </button>
                        </form>
                      </div>
                    )}

                  </div>

                </div>
              )}

            </div>
          )}

        </div>

      </main>

    </div>
  );
}
