import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  Square, 
  Plus, 
  Check, 
  ShoppingBag, 
  Receipt, 
  Sparkles,
  Volume2
} from 'lucide-react';

// Dynamically determine the backend URL based on where the app is being accessed from
const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:5000/api' 
  : `http://${window.location.hostname}:5000/api`;

export default function App() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [language, setLanguage] = useState('ta');
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [activeItemForPrice, setActiveItemForPrice] = useState(null);
  const [enteredPrice, setEnteredPrice] = useState('');
  const [activeTab, setActiveTab] = useState('to_buy'); // 'to_buy', 'bought', 'summary'


  const recognitionRef = useRef(null);

  const fetchData = async () => {
    try {
      const [itemsRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/items`),
        fetch(`${API_BASE}/summary`),
      ]);
      const itemsData = await itemsRes.json();
      const summaryData = await summaryRes.json();
      setItems(Array.isArray(itemsData) ? itemsData : []);
      setSummary(summaryData);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getLanguageTag = (code) => {
    if (code === 'ta') return 'ta-IN';
    if (code === 'si') return 'si-LK';
    return 'en-US';
  };

  const addItemDirectly = async (textToSend) => {
    if (!textToSend || !textToSend.trim()) return;
    setLoading(true);
    setStatusMessage('Processing...');

    try {
      const res = await fetch(`${API_BASE}/process-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSend.trim(), language }),
      });

      if (res.ok) {
        const data = await res.json();
        setStatusMessage('✓ Processed successfully!');
        
        if (data.intent === 'navigate' && data.target) {
          setActiveTab(data.target);
        }

        if (data.speechText && window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(data.speechText);
          
          // Slow down the speech to make it clearer (1.0 is default, 0.75 is slower)
          utterance.rate = 0.75; 
          
          if (language === 'ta') utterance.lang = 'ta-IN';
          else if (language === 'si') utterance.lang = 'si-LK';
          else utterance.lang = 'en-US';
          window.speechSynthesis.speak(utterance);
        }

        await fetchData();
        setTimeout(() => setStatusMessage(''), 2500);
      } else {
        setStatusMessage('Error processing request');
      }
    } catch (err) {
      console.error('Network error:', err);
      setStatusMessage('Network connection error to backend');
    } finally {
      setLoading(false);
    }
  };

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Please open this page in Google Chrome or Microsoft Edge for voice support.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false; // Wait for final confirmed words
      recognition.lang = getLanguageTag(language);

      recognition.onstart = () => {
        setIsRecording(true);
        setStatusMessage('Listening... Speak now');
        setTranscript('');
      };

      recognition.onresult = (event) => {
        const spoken = event.results[0][0].transcript;
        console.log('Spoken phrase recognized:', spoken);
        setTranscript(spoken);
        // Automatically save the spoken words immediately
        addItemDirectly(spoken);
      };

      recognition.onerror = (event) => {
        console.warn('Speech error:', event.error);
        setIsRecording(false);
        setStatusMessage('Could not hear audio. Please try again.');
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Recognition error:', err);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleTextSubmit = async (e) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    await addItemDirectly(textInput);
    setTextInput('');
  };

  const confirmBought = async () => {
    if (!activeItemForPrice) return;
    const priceNum = enteredPrice ? parseFloat(enteredPrice) : null;

    try {
      await fetch(`${API_BASE}/items/${activeItemForPrice.id}/mark-bought`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: priceNum }),
      });
      setActiveItemForPrice(null);
      setEnteredPrice('');
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const toBuy = items.filter((i) => i.status === 'to_buy');
  const bought = items.filter((i) => i.status === 'bought');

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '24px 16px 120px' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(99, 102, 241, 0.35)'
          }}>
            <ShoppingBag size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Voice Notebook
              <Sparkles size={16} color="#fbbf24" fill="#fbbf24" />
            </h1>
            <p style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '500' }}>
              {language === 'ta' ? 'குரல் வழி வாங்கும் பட்டியல்' : language === 'si' ? 'කටහඬින් ලියන සටහන' : 'Smart Voice Shopping'}
            </p>
          </div>
        </div>

        {/* Language Tabs */}
        <div style={{ display: 'flex', background: 'rgba(30, 41, 59, 0.7)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          {[
            { code: 'ta', label: 'தமிழ்' },
            { code: 'en', label: 'EN' },
            { code: 'si', label: 'සිංහල' },
          ].map((lang) => (
            <button
              key={lang.code}
              onClick={() => setLanguage(lang.code)}
              style={{
                border: 'none',
                background: language === lang.code ? '#6366f1' : 'transparent',
                color: language === lang.code ? '#fff' : '#94a3b8',
                padding: '6px 10px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: language === lang.code ? '0 4px 12px rgba(99, 102, 241, 0.4)' : 'none'
              }}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Mic Card */}
      <section className="glass-panel" style={{ padding: '36px 20px', textAlign: 'center', marginBottom: '24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute',
          top: '-40px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '180px',
          height: '180px',
          background: isRecording ? 'rgba(239, 68, 68, 0.25)' : 'rgba(99, 102, 241, 0.25)',
          borderRadius: '50%',
          filter: 'blur(50px)',
          pointerEvents: 'none'
        }} />

        <div style={{ position: 'relative', display: 'inline-block', margin: '8px 0 20px' }}>
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={loading}
            className={isRecording ? 'mic-recording' : ''}
            style={{
              width: '92px',
              height: '92px',
              borderRadius: '50%',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 16px 36px rgba(99, 102, 241, 0.4)',
              transition: 'all 0.25s ease',
              outline: 'none'
            }}
          >
            {isRecording ? <Square size={32} fill="#fff" /> : <Mic size={38} />}
          </button>
        </div>

        <h2 style={{ fontSize: '17px', fontWeight: '700', color: '#f8fafc', marginBottom: '6px' }}>
          {isRecording ? 'Listening... Speak now' : 'Tap & Speak your groceries'}
        </h2>
        
        {statusMessage && (
          <div style={{ fontSize: '12px', color: '#818cf8', fontWeight: '600', marginBottom: '6px' }}>
            {statusMessage}
          </div>
        )}

        {transcript && (
          <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            background: 'rgba(15, 23, 42, 0.85)',
            borderRadius: '14px',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            fontSize: '14px',
            color: '#c7d2fe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}>
            <Volume2 size={16} color="#818cf8" style={{ flexShrink: 0 }} />
            <span>"{transcript}"</span>
          </div>
        )}
      </section>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: 'rgba(30, 41, 59, 0.4)', padding: '6px', borderRadius: '16px' }}>
        {[
          { id: 'to_buy', label: 'To Buy', count: toBuy.length },
          { id: 'bought', label: 'Bought', count: bought.length },
          { id: 'summary', label: 'Summary' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              border: 'none',
              background: activeTab === tab.id ? '#4f46e5' : 'transparent',
              color: activeTab === tab.id ? '#fff' : '#94a3b8',
              padding: '10px',
              borderRadius: '12px',
              fontWeight: '700',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span style={{ 
                background: activeTab === tab.id ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', 
                padding: '2px 6px', 
                borderRadius: '8px', 
                fontSize: '10px' 
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'to_buy' && (
        <>
          {/* Manual Input Bar */}
          <form onSubmit={handleTextSubmit} style={{ display: 'flex', gap: '10px', marginBottom: '32px' }}>
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={language === 'ta' ? 'அல்லது இங்கே தட்டச்சு செய்க...' : 'Or type items here (e.g. 2 banana)...'}
              style={{
                flex: 1,
                background: 'rgba(18, 24, 38, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '14px 18px',
                fontSize: '14px',
                color: '#fff',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              disabled={loading || !textInput.trim()}
              style={{
                border: 'none',
                background: '#6366f1',
                color: '#fff',
                padding: '0 20px',
                borderRadius: '16px',
                fontWeight: '600',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Plus size={18} />
              <span>Add</span>
            </button>
          </form>

          {/* To Buy Items */}
          <section style={{ marginBottom: '36px' }}>
            {toBuy.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 16px', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '20px', border: '1px dashed rgba(255, 255, 255, 0.08)', color: '#64748b', fontSize: '13px' }}>
                Your basket is empty. Tap the mic to record!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {toBuy.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setActiveItemForPrice(item)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px 18px',
                      background: 'rgba(24, 32, 51, 0.65)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '18px',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: 'rgba(99, 102, 241, 0.15)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#818cf8'
                      }}>
                        <Check size={16} />
                      </div>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: '#f8fafc', textTransform: 'capitalize' }}>
                          {item.item_name}
                        </div>
                        <span style={{
                          display: 'inline-block',
                          marginTop: '4px',
                          fontSize: '11px',
                          fontWeight: '700',
                          padding: '2px 8px',
                          background: 'rgba(99, 102, 241, 0.18)',
                          color: '#c7d2fe',
                          borderRadius: '6px'
                        }}>
                          {item.quantity}
                        </span>
                      </div>
                    </div>

                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#818cf8' }}>
                      Mark Done →
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === 'bought' && (
        <section style={{ marginBottom: '36px' }}>
          {bought.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '20px', border: '1px dashed rgba(255, 255, 255, 0.08)', color: '#64748b', fontSize: '13px' }}>
              You haven't bought anything yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {bought.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'rgba(15, 23, 42, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    borderRadius: '14px',
                    color: '#64748b',
                    fontSize: '14px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ textDecoration: 'line-through', textTransform: 'capitalize', color: '#94a3b8' }}>
                        {item.item_name} ({item.quantity})
                      </span>
                      {item.bought_at && (
                        <span style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>
                          {new Date(item.bought_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#34d399',
                    background: 'rgba(16, 185, 129, 0.1)',
                    padding: '4px 10px',
                    borderRadius: '8px'
                  }}>
                    {item.price ? `Rs. ${item.price.toFixed(2)}` : '✓ Done'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'summary' && (
        <section className="glass-panel" style={{ padding: '20px' }}>
          {summary && summary.breakdown && Object.keys(summary.breakdown).length > 0 ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Receipt size={18} color="#818cf8" />
                  <h4 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#c7d2fe' }}>
                    Total Spending
                  </h4>
                </div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#34d399', fontFamily: 'monospace' }}>
                  Rs. {summary.grandTotal}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '14px', fontSize: '13px' }}>
                {Object.keys(summary.breakdown).map((date) => (
                  <div key={date}>
                    <h5 style={{ fontSize: '14px', fontWeight: 'bold', color: '#818cf8', marginBottom: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.04)', paddingBottom: '4px' }}>
                      {new Date(date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {summary.breakdown[date].map((row, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                          <span style={{ textTransform: 'capitalize' }}>{row.item_name}</span>
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                            Bought {row.total_bought_count}x {row.item_total_spent ? `(Rs. ${row.item_total_spent})` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
             <div style={{ textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
               No summary available yet.
             </div>
          )}
        </section>
      )}

      {/* Price Dialog */}
      {activeItemForPrice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5, 8, 16, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 999 }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '360px', padding: '28px', textAlign: 'center' }}>
            <h3 style={{ fontSize: '17px', fontWeight: '700', marginBottom: '6px', textTransform: 'capitalize' }}>
              {activeItemForPrice.item_name} ({activeItemForPrice.quantity})
            </h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '20px' }}>
              How much did you spend? (Optional)
            </p>

            <div style={{ position: 'relative', marginBottom: '20px' }}>
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontWeight: '600' }}>
                Rs.
              </span>
              <input
                type="number"
                step="0.01"
                autoFocus
                value={enteredPrice}
                onChange={(e) => setEnteredPrice(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '14px',
                  padding: '12px 14px 12px 48px',
                  fontSize: '18px',
                  fontWeight: '700',
                  color: '#fff',
                  outline: 'none'
                }}
                onKeyDown={(e) => e.key === 'Enter' && confirmBought()}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                onClick={() => { setActiveItemForPrice(null); setEnteredPrice(''); }}
                style={{ padding: '12px', background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', borderRadius: '12px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBought}
                style={{ padding: '12px', background: '#6366f1', border: 'none', color: '#fff', borderRadius: '12px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}