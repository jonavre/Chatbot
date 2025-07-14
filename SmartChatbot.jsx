import React, { useState, useRef, useEffect } from 'react';

const BACKEND_BASE_URL = "http://127.0.0.1:8000";

export default function SmartChatbot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [pdfName, setPdfName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const chatEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handlePdfLoad = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Optional: Limit file size to 10MB
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('PDF too large, max 10MB allowed');
      return;
    }

    setErrorMsg('');
    setPdfName(file.name);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${BACKEND_BASE_URL}/upload-pdf`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        setErrorMsg('Failed to load PDF: ' + (errorData.error || res.statusText));
        return;
      }

      const data = await res.json();

      setMessages([
        {
          role: 'system',
          content: `✅ PDF loaded successfully (${data.characters} characters).`,
        },
      ]);
    } catch (err) {
      setErrorMsg('Upload failed: ' + err.message);
    }
  };

  const handleSend = () => {
    if (!input.trim()) return;
    setErrorMsg('');
    const userMsg = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(
      `${BACKEND_BASE_URL}/chat_stream?message=${encodeURIComponent(input)}`
    );
    eventSourceRef.current = eventSource;

    let aiResponse = '';
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'content') {
          aiResponse += data.content;
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: 'assistant', content: aiResponse },
          ]);
        } else if (data.type === 'done') {
          eventSource.close();
          setLoading(false);
        }
      } catch (error) {
        console.error('JSON parse error:', error, event.data);
      }
    };

    eventSource.onerror = () => {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: '[❌ Error receiving response]' },
      ]);
      eventSource.close();
      setLoading(false);
    };
  };

  const handleClear = () => {
    setMessages([]);
    setInput('');
    setPdfName('');
    setErrorMsg('');
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="flex flex-col w-full max-w-3xl bg-white border rounded-lg shadow-lg overflow-hidden">
        <div className="bg-blue-600 text-white px-6 py-4 text-lg font-semibold flex justify-between items-center">
          <span>🧠 AI PDF Assistant</span>
          <input
            type="file"
            accept=".pdf"
            onChange={handlePdfLoad}
            className="text-sm text-white file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-white file:text-blue-600 hover:file:bg-gray-100"
          />
        </div>

        {pdfName && (
          <div className="text-sm text-gray-600 px-6 py-2 border-b">
            ✅ <strong>PDF loaded:</strong> {pdfName}
          </div>
        )}

        {errorMsg && (
          <div className="text-red-600 px-6 py-2 border-b">
            ⚠️ {errorMsg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3 bg-gray-50">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              } mb-3`}
            >
              <div
                className={`max-w-[75%] px-4 py-2 rounded-2xl shadow-sm text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : msg.role === 'system'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-200 text-gray-800'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <p className="text-sm italic text-gray-500 text-left">
              Assistant is typing...
            </p>
          )}
          <div ref={chatEndRef}></div>
        </div>

        <div className="border-t p-4 bg-white">
          <textarea
            rows="2"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask something about the PDF..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />

          <div className="mt-2 flex justify-between">
            <button
              onClick={handleSend}
              disabled={loading}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Send
            </button>
            <button
              onClick={handleClear}
              className="bg-gray-300 text-gray-800 text-sm px-4 py-2 rounded-lg hover:bg-gray-400"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
