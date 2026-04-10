import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { 
  FileText, Plus, Download, Printer, Settings, 
  Home, ChevronRight, LayoutTemplate, FileCode2, 
  Trash2, PlusCircle, User, BookOpen, Clock, FileCheck,
  Save, Columns, AlignLeft, List, CheckCircle2, Bookmark,
  Search, Type, ListOrdered, BarChart2, Hash,
  ArrowUp, ArrowDown, Shield, FileDown, Loader2, Sparkles, Wand2, X, MessageSquare,
  SpellCheck, Library, Target, Scale, Book, Presentation, RefreshCw, AlertCircle
} from 'lucide-react';

// --- 1. Your Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyA0Jw3tsSgZkvwREV48Tqc-vDi-1or9SuQ",
  authDomain: "aca-doc-pro.firebaseapp.com",
  projectId: "aca-doc-pro",
  storageBucket: "aca-doc-pro.firebasestorage.app",
  messagingSenderId: "1077632763373",
  appId: "1:1077632763373:web:6c627203d6a40926f693e4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const customAppId = 'acadoc-production-1';

// --- 2. Gemini API Helper (Stable Gemini 2.5 Flash) ---
const callGeminiAPI = async (prompt) => {
  // Empty string allows the Canvas execution environment to inject the key automatically at runtime.
  // When hosting locally, you will put your actual API key inside these quotes.
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
  };

  const delays = [1000, 2000, 4000, 8000, 16000];
  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.error?.message) throw new Error(data.error.message);
        throw new Error(`HTTP status: ${response.status}`);
      }

      if (data.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new Error("Content blocked by safety filters. Try rewording your text.");
      }

      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (error) {
      if (i === 4) throw error;
      await new Promise(resolve => setTimeout(resolve, delays[i]));
    }
  }
};

// --- Default Mock Data ---
const goldStandardDoc = {
  id: 'doc-1',
  title: 'The Impact of Quantum Entanglement on Cryptographic Systems',
  author: 'Dr. Jane Doe, Ph.D.',
  institution: 'Institute for Advanced Computational Studies',
  date: 'April 3, 2026',
  abstract: 'This paper explores the theoretical vulnerabilities of modern RSA encryption algorithms when subjected to Shor\'s algorithm running on a sufficiently stable quantum computer. We present a novel theoretical framework for post-quantum cryptographic key exchange, utilizing lattice-based cryptography, and analyze its resilience against both classical and quantum attacks.',
  keywords: 'Quantum Computing, RSA Encryption, Shor\'s Algorithm, Lattice-Based Cryptography, Post-Quantum',
  layout: 'double',
  fontStyle: 'serif',
  includeToC: true,
  watermark: false,
  status: 'Published',
  updatedAt: Date.now(),
  references: [
    { id: 101, text: 'Shor, P.W. (1994). Algorithms for quantum computation: discrete logarithms and factoring. Proceedings 35th Annual Symposium on Foundations of Computer Science, 124-134.' },
    { id: 102, text: 'NIST. (2022). Post-Quantum Cryptography Standardization. National Institute of Standards and Technology.' }
  ],
  sections: [
    {
      id: 1,
      title: '1. Introduction',
      content: 'The advent of quantum computing poses a significant threat to current cryptographic standards. Traditional public-key cryptography, which relies on the difficulty of factoring large prime numbers, could be rendered obsolete. This paper addresses the urgent need for quantum-resistant algorithms.'
    },
    {
      id: 2,
      title: '2. Methodology',
      content: 'We simulated a 4096-qubit environment using the Qiskit framework to test standard RSA-2048 encryption. We then compared these results against our proposed lattice-based encryption model, focusing on computational overhead and key transmission latency.'
    },
    {
      id: 3,
      title: '3. Results & Discussion',
      content: 'Our findings indicate that while the lattice-based approach introduces a 14% increase in computational overhead during the key exchange phase, it completely neutralizes the decryption vector utilized by our simulated Shor\'s algorithm attack. The structural integrity of the lattice remained mathematically uncompromised.'
    },
    {
      id: 4,
      title: '4. Conclusion',
      content: 'Transitioning to post-quantum cryptographic standards is not merely a theoretical exercise but a practical necessity. The proposed lattice framework offers a viable, highly secure alternative that can be implemented within existing digital infrastructure.'
    }
  ]
};

const blankDoc = {
  id: '',
  title: '',
  author: '',
  institution: '',
  date: '',
  abstract: '',
  keywords: '',
  layout: 'single',
  fontStyle: 'serif',
  includeToC: false,
  watermark: false,
  status: 'Draft',
  references: [],
  sections: [{ id: Date.now(), title: '', content: '' }]
};

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [documents, setDocuments] = useState([]);
  const [activeDoc, setActiveDoc] = useState(null);
  
  // Auth & DB State
  const [user, setUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Initialize Real-world Authentication with Error Handling
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (!auth.currentUser) {
          // Attempt Custom Token first for Canvas compatibility, fallback to Anonymous Auth
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
          } else {
            await signInAnonymously(auth);
          }
        }
      } catch (error) {
        console.error("Auth init error:", error);
        // Provide exact instructions if Anonymous Auth isn't enabled in Firebase Console yet
        if (error.code === 'auth/admin-restricted-operation' || error.code === 'auth/operation-not-allowed') {
          setAuthError("To save to your database, please enable the 'Anonymous' Sign-In Provider in your Firebase Console (under Authentication > Sign-in method).");
        } else {
          setAuthError(error.message);
        }
        setIsInitializing(false);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsInitializing(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch User Documents
  useEffect(() => {
    if (!user || !db) {
      setDocuments([goldStandardDoc]);
      return;
    }
    
    const docsRef = collection(db, 'artifacts', customAppId, 'users', user.uid, 'documents');
    
    const unsubscribe = onSnapshot(docsRef, (snapshot) => {
      const fetchedDocs = [];
      snapshot.forEach(docSnap => {
        fetchedDocs.push({ id: docSnap.id, ...docSnap.data() });
      });

      fetchedDocs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      if (fetchedDocs.length === 0) {
        setDocuments([goldStandardDoc]);
      } else {
        setDocuments(fetchedDocs);
      }
    }, (error) => {
      console.error("Snapshot error:", error);
      setDocuments([goldStandardDoc]);
    });

    return () => unsubscribe();
  }, [user]);

  const handleCreateNew = async () => {
    const newDoc = { ...blankDoc, id: `doc-${Date.now()}`, updatedAt: Date.now() };
    setActiveDoc(newDoc);
    setCurrentView('editor');
    if (user) await handleSaveToCloud(newDoc);
  };

  const handleOpenDoc = (docToOpen) => {
    setActiveDoc(docToOpen);
    setCurrentView('editor');
  };

  const handleSaveToCloud = async (docToSave) => {
    if (!user || !db) return;
    try {
      const docRef = doc(db, 'artifacts', customAppId, 'users', user.uid, 'documents', docToSave.id);
      await setDoc(docRef, { ...docToSave, updatedAt: Date.now() });
    } catch (err) {
      console.error("Error saving document to cloud:", err);
    }
  };

  const handleDeleteDoc = async (id, e) => {
    e.stopPropagation();
    if (!user || !db) return;
    try {
      const docRef = doc(db, 'artifacts', customAppId, 'users', user.uid, 'documents', id);
      await deleteDoc(docRef);
    } catch (err) {
      console.error("Error deleting document:", err);
    }
  };

  const handleBackToDashboard = () => {
    if (activeDoc && user) handleSaveToCloud(activeDoc);
    setCurrentView('dashboard');
    setActiveDoc(null);
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-indigo-600">
        <Loader2 className="animate-spin w-10 h-10 mb-4" />
        <p className="font-medium text-slate-500">Connecting to secure cloud...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-academic-doc, #printable-academic-doc * { visibility: visible; }
          #printable-academic-doc {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 2cm;
            background: white;
            box-shadow: none;
          }
          .print-watermark {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 140px;
            font-weight: bold;
            color: rgba(200, 200, 200, 0.25);
            z-index: -1;
            pointer-events: none;
            white-space: nowrap;
          }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      {/* Top Navigation */}
      <nav className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10 print:hidden shadow-sm">
        <div className="flex items-center space-x-2">
          <div className="bg-indigo-600 text-white p-1.5 rounded-lg">
            <FileText size={24} />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-blue-500">
            AcaDoc Gen
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full ml-2">
            PRO
          </span>
        </div>
        
        <div className="flex items-center space-x-4">
          {!user && (
            <div className="flex items-center text-amber-600 bg-amber-50 px-3 py-1 rounded-full text-xs font-medium border border-amber-100">
              <AlertCircle size={14} className="mr-1.5" />
              Demo Mode
            </div>
          )}
          {user && (
            <span className="hidden md:inline-block text-xs font-medium text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
              ID: {user.uid.substring(0, 8)}...
            </span>
          )}
          <button className="text-slate-500 hover:text-slate-800 transition-colors">
            <Settings size={20} />
          </button>
          <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center border border-slate-300 overflow-hidden text-indigo-600">
            <User size={18} />
          </div>
        </div>
      </nav>

      {/* Auth Error Banner */}
      {authError && (
        <div className="bg-rose-50 border-b border-rose-100 px-6 py-2 flex items-center justify-center text-rose-600 text-xs font-medium print:hidden">
          <AlertCircle size={14} className="mr-2" />
          Cloud Features Disabled: {authError}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col print:block">
        {currentView === 'dashboard' && (
          <DashboardView 
            documents={documents} 
            onCreateNew={handleCreateNew} 
            onOpenDoc={handleOpenDoc}
            onDeleteDoc={handleDeleteDoc}
          />
        )}
        
        {currentView === 'editor' && (
          <EditorView 
            doc={activeDoc} 
            setDoc={setActiveDoc} 
            onBack={handleBackToDashboard}
            onSaveCloud={handleSaveToCloud}
            user={user}
          />
        )}
      </main>
    </div>
  );
}

// ==========================================
// DASHBOARD VIEW
// ==========================================
function DashboardView({ documents, onCreateNew, onOpenDoc, onDeleteDoc }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDocs = documents.filter(doc => 
    doc.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    doc.author?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto w-full p-8 print:hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Your Cloud Workspace</h1>
          <p className="text-slate-500 mt-1">Manage, edit, and export your persistently saved reports.</p>
        </div>
        <div className="flex items-center w-full md:w-auto gap-4">
          <div className="relative w-full md:w-64">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm text-sm"
            />
          </div>
          <button 
            onClick={onCreateNew}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium flex items-center shadow-sm transition-all active:scale-95 whitespace-nowrap"
          >
            <Plus size={18} className="mr-2" />
            New Document
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          onClick={onCreateNew}
          className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50/50 hover:bg-slate-100 hover:border-indigo-400 cursor-pointer flex flex-col items-center justify-center min-h-[240px] transition-all group"
        >
          <div className="h-12 w-12 rounded-full bg-white shadow-sm flex items-center justify-center text-indigo-500 mb-4 group-hover:scale-110 transition-transform">
            <Plus size={24} />
          </div>
          <span className="font-semibold text-slate-700">Start from Scratch</span>
          <span className="text-sm text-slate-500 mt-1">Blank academic template</span>
        </div>

        {filteredDocs.map(doc => (
          <div 
            key={doc.id} 
            onClick={() => onOpenDoc(doc)}
            className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md cursor-pointer flex flex-col min-h-[240px] transition-all overflow-hidden group relative"
          >
            <button 
              onClick={(e) => onDeleteDoc(doc.id, e)}
              className="absolute top-3 right-3 z-10 bg-white text-slate-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-full shadow-sm border border-slate-100 opacity-0 group-hover:opacity-100 transition-all"
              title="Delete Document"
            >
              <Trash2 size={14} />
            </button>

            <div className="h-32 bg-slate-100 border-b border-slate-100 relative p-4 flex justify-center overflow-hidden">
               <div className="w-24 h-32 bg-white shadow-sm rounded-sm p-2 text-[4px] leading-tight text-slate-300 font-serif">
                 <div className="font-bold text-center text-[6px] text-slate-500 mb-2">{doc.title?.substring(0, 20)}...</div>
                 <div className="text-center mb-2">{doc.author}</div>
                 <div className="bg-slate-200 h-8 mb-2"></div>
                 <div className="bg-slate-200 h-1 mb-1"></div>
                 <div className="bg-slate-200 h-1 mb-1"></div>
                 <div className="bg-slate-200 h-1 mb-1 w-2/3"></div>
               </div>
               {doc.id === 'doc-1' && (
                 <div className="absolute top-2 right-2 bg-amber-100 text-amber-700 text-[8px] px-1.5 py-0.5 rounded shadow-sm border border-amber-200 font-medium flex items-center">
                    <FileCheck size={8} className="mr-1" /> Gold Standard
                 </div>
               )}
            </div>
            
            <div className="p-4 flex-1 flex flex-col">
              <div className="flex justify-between items-start mb-1 gap-2">
                <h3 className="font-bold text-slate-800 leading-tight line-clamp-2 group-hover:text-indigo-600 transition-colors">
                  {doc.title || 'Untitled Document'}
                </h3>
                {doc.status && (
                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm whitespace-nowrap ${doc.status === 'Published' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {doc.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-auto">{doc.author || 'No author'}</p>
              
              <div className="flex items-center text-xs text-slate-400 mt-4 pt-3 border-t border-slate-100">
                <Clock size={12} className="mr-1" />
                <span>
                  {doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : 'Just now'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// EDITOR VIEW (FULLY EXPANDED AI HANDLERS)
// ==========================================
function EditorView({ doc, setDoc, onBack, onSaveCloud, user }) {
  const [saveStatus, setSaveStatus] = useState('saved'); 
  
  // Expanded AI Loading States
  const [isGeneratingAbstract, setIsGeneratingAbstract] = useState(false);
  const [enhancingSectionId, setEnhancingSectionId] = useState(null);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [formattingReferenceId, setFormattingReferenceId] = useState(null);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [continuingSectionId, setContinuingSectionId] = useState(null);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [simplifyingSectionId, setSimplifyingSectionId] = useState(null);
  const [isGeneratingConclusion, setIsGeneratingConclusion] = useState(false);
  const [critiquingSectionId, setCritiquingSectionId] = useState(null);
  const [aiFeedbackModal, setAiFeedbackModal] = useState({ isOpen: false, title: '', content: '', isLoading: false });
  const [isSuggestingLiterature, setIsSuggestingLiterature] = useState(false);
  const [proofreadingSectionId, setProofreadingSectionId] = useState(null);
  const [addingCounterpointId, setAddingCounterpointId] = useState(null);
  const [isGeneratingGlossary, setIsGeneratingGlossary] = useState(false);
  const [checkingClaimsId, setCheckingClaimsId] = useState(null);
  const [paraphrasingSectionId, setParaphrasingSectionId] = useState(null);

  const stats = React.useMemo(() => {
    if (!doc) return { words: 0, readingTime: 0 };
    const allText = `${doc.title} ${doc.abstract} ${doc.keywords} ${(doc.sections || []).map(s => s.title + ' ' + s.content).join(' ')} ${(doc.references || []).map(r => r.text).join(' ')}`;
    const words = allText.trim().split(/\s+/).filter(w => w.length > 0).length;
    const readingTime = Math.max(1, Math.ceil(words / 200)); 
    return { words, readingTime };
  }, [doc]);

  useEffect(() => {
    if (!user) return; // Skip saving in Demo Mode
    setSaveStatus('edited');
    const timer = setTimeout(() => {
      setSaveStatus('saving');
      onSaveCloud(doc);
      setTimeout(() => setSaveStatus('saved'), 600);
    }, 1500); 
    return () => clearTimeout(timer);
  }, [doc, onSaveCloud, user]);

  const updateField = (field, value) => { setDoc({ ...doc, [field]: value }); };
  const updateSection = (id, field, value) => { setDoc({ ...doc, sections: doc.sections.map(sec => sec.id === id ? { ...sec, [field]: value } : sec) }); };
  const addSection = () => { setDoc({ ...doc, sections: [...doc.sections, { id: Date.now(), title: '', content: '' }] }); };
  const removeSection = (id) => { setDoc({ ...doc, sections: doc.sections.filter(sec => sec.id !== id) }); };
  const moveSection = (index, direction) => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === doc.sections.length - 1)) return;
    const newSections = [...doc.sections];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newSections[index], newSections[targetIndex]] = [newSections[targetIndex], newSections[index]];
    setDoc({ ...doc, sections: newSections });
  };
  const addReference = () => { setDoc({ ...doc, references: [...(doc.references || []), { id: Date.now(), text: '' }] }); };
  const updateReference = (id, text) => { setDoc({ ...doc, references: doc.references.map(ref => ref.id === id ? { ...ref, text } : ref) }); };
  const removeReference = (id) => { setDoc({ ...doc, references: doc.references.filter(ref => ref.id !== id) }); };
  const moveReference = (index, direction) => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === doc.references.length - 1)) return;
    const newRefs = [...doc.references];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newRefs[index], newRefs[targetIndex]] = [newRefs[targetIndex], newRefs[index]];
    setDoc({ ...doc, references: newRefs });
  };

  // ==========================================
  // EXPLICIT AI HANDLERS (ALL 18 WORKFLOWS)
  // ==========================================
  
  const handleGenerateTitle = async () => {
    const content = `Abstract: ${doc.abstract}\n\nSections: ${(doc.sections || []).map(s => s.content).join('\n')}`;
    if (!content.trim()) return;
    setIsGeneratingTitle(true);
    try {
      const prompt = `You are an expert academic editor. Generate a highly professional, accurate academic title for a paper with the following content. Output ONLY the title, no quotes, no introductions.\n\n${content}`;
      const generatedTitle = await callGeminiAPI(prompt);
      if (generatedTitle) updateField('title', generatedTitle);
    } catch (e) { window.alert(`AI Error: ${e.message}`); } finally { setIsGeneratingTitle(false); }
  };

  const handleFormatReference = async (refId, currentText) => {
    if (!currentText.trim()) return;
    setFormattingReferenceId(refId);
    try {
      const prompt = `You are an expert academic librarian. Format the following raw text or URL into a perfectly formatted APA style academic citation. If some details are missing, do your best to infer or format what is provided cleanly. Output ONLY the citation text, no markdown formatting, no quotes, no conversational text.\n\nRaw input:\n${currentText}`;
      const formattedText = await callGeminiAPI(prompt);
      if (formattedText) updateReference(refId, formattedText);
    } catch (e) { window.alert(`AI Error: ${e.message}`); } finally { setFormattingReferenceId(null); }
  };

  const handleGenerateAbstract = async () => {
    const fullText = (doc.sections || []).map(s => `${s.title}\n${s.content}`).join('\n\n');
    if (!fullText.trim()) return;
    setIsGeneratingAbstract(true);
    try {
      const prompt = `You are an expert academic editor. Write a concise, professional academic abstract (approx 150-250 words) based on the following paper content. Output ONLY the abstract text, no quotes or introductions.\n\nPaper Content:\n${fullText}`;
      const abstractText = await callGeminiAPI(prompt);
      if (abstractText) updateField('abstract', abstractText);
    } catch (e) { window.alert(`AI Error: ${e.message}`); } finally { setIsGeneratingAbstract(false); }
  };

  const handleEnhanceSection = async (sectionId, currentContent) => {
    if (!currentContent.trim()) return;
    setEnhancingSectionId(sectionId);
    try {
      const prompt = `You are an expert academic editor. Rewrite, expand, and professionalize the following draft text into formal academic prose suitable for a peer-reviewed journal. Output ONLY the rewritten text, no conversational filler or markdown quotes.\n\nDraft Text:\n${currentContent}`;
      const enhancedText = await callGeminiAPI(prompt);
      if (enhancedText) updateSection(sectionId, 'content', enhancedText);
    } catch (e) { window.alert(`AI Error: ${e.message}`); } finally { setEnhancingSectionId(null); }
  };

  const handleSuggestKeywords = async () => {
    const content = `Title: ${doc.title}\nAbstract: ${doc.abstract}\n\nSections: ${(doc.sections || []).map(s => s.content).join('\n')}`;
    if (!content.trim()) return;
    setIsGeneratingKeywords(true);
    try {
      const prompt = `You are an expert academic indexer. Based on the following paper content, suggest 5 to 7 highly relevant, professional academic keywords, separated by commas. Output ONLY the comma-separated list, no quotes or additional text.\n\n${content}`;
      const keywords = await callGeminiAPI(prompt);
      if (keywords) updateField('keywords', keywords);
    } catch (e) { window.alert(`AI Error: ${e.message}`); } finally { setIsGeneratingKeywords(false); }
  };

  const handleContinueSection = async (sectionId, currentContent) => {
    if (!currentContent.trim()) return;
    setContinuingSectionId(sectionId);
    try {
      const prompt = `You are an expert academic co-author. The author is currently writing this section:\n"${currentContent}"\n\nContinue writing logically and professionally for one more paragraph. Maintain the academic tone. Output ONLY the continuation text, no introductions, no quotes, no markdown.`;
      const continuation = await callGeminiAPI(prompt);
      if (continuation) {
        const newContent = currentContent + (currentContent.endsWith('\n') ? '\n' : '\n\n') + continuation;
        updateSection(sectionId, 'content', newContent);
      }
    } catch (e) { window.alert(`AI Error: ${e.message}`); } finally { setContinuingSectionId(null); }
  };

  const handleGenerateOutline = async () => {
    if (!doc.title && !doc.abstract) return;
    setIsGeneratingOutline(true);
    try {
      const prompt = `You are an expert academic planner. Based on this title: "${doc.title}" and abstract: "${doc.abstract}", suggest 4 to 6 standard section headings for the body of the paper. Output ONLY the headings, one per line, with no numbers, bullet points, or markdown formatting.`;
      const outlineText = await callGeminiAPI(prompt);
      if (outlineText) {
        const headings = outlineText.split('\n').map(h => h.replace(/^#+\s*/, '').replace(/^\d+\.\s*/, '').trim()).filter(h => h);
        if (headings.length > 0) {
          const newSections = headings.map((heading, idx) => ({ id: Date.now() + idx, title: heading, content: '' }));
          setDoc({ ...doc, sections: newSections });
        }
      }
    } catch (e) { window.alert(`AI Error: ${e.message}`); } finally { setIsGeneratingOutline(false); }
  };

  const handleSimplifySection = async (sectionId, currentContent) => {
    if (!currentContent.trim()) return;
    setSimplifyingSectionId(sectionId);
    try {
      const prompt = `You are an expert science communicator. Translate the following academic text into clear, simple language that a general audience (like a high school student) can understand. Maintain the core factual meaning but remove dense jargon. Output ONLY the simplified text, no markdown or quotes.\n\nText:\n${currentContent}`;
      const simplifiedText = await callGeminiAPI(prompt);
      if (simplifiedText) updateSection(sectionId, 'content', simplifiedText);
    } catch (e) { window.alert(`AI Error: ${e.message}`); } finally { setSimplifyingSectionId(null); }
  };

  const handleGenerateConclusion = async () => {
    const content = `Title: ${doc.title}\nAbstract: ${doc.abstract}\n\nSections: ${(doc.sections || []).map(s => s.content).join('\n')}`;
    if (!content.trim()) return;
    setIsGeneratingConclusion(true);
    try {
      const prompt = `You are an expert academic writer. Based on the following paper content, write a comprehensive and insightful conclusion (approx 200-300 words). Summarize the main findings, discuss their implications, and suggest directions for future research. Output ONLY the conclusion text, no headers or markdown.\n\n${content}`;
      const conclusionText = await callGeminiAPI(prompt);
      if (conclusionText) {
        setDoc({ ...doc, sections: [...doc.sections, { id: Date.now(), title: 'Conclusion', content: conclusionText }] });
      }
    } catch (e) { window.alert(`AI Error: ${e.message}`); } finally { setIsGeneratingConclusion(false); }
  };

  const handleCritiqueSection = async (sectionId, currentContent) => {
    if (!currentContent.trim()) return;
    setCritiquingSectionId(sectionId);
    setAiFeedbackModal({ isOpen: true, title: 'AI Peer Review', content: '', isLoading: true });
    try {
      const prompt = `You are a rigorous academic peer reviewer (Reviewer #2). Critically evaluate the following section of an academic paper. Identify any logical flaws, unsupported claims, missing citations, or areas needing clarification. Provide constructive, bulleted feedback. Output ONLY the feedback.\n\nSection Text:\n${currentContent}`;
      const feedback = await callGeminiAPI(prompt);
      setAiFeedbackModal({ isOpen: true, title: 'Peer Review Feedback', content: feedback, isLoading: false });
    } catch (e) { setAiFeedbackModal({ isOpen: true, title: 'Error', content: `Failed to generate critique: ${e.message}`, isLoading: false }); } finally { setCritiquingSectionId(null); }
  };

  const handleProofreadSection = async (sectionId, currentContent) => {
    if (!currentContent.trim()) return;
    setProofreadingSectionId(sectionId);
    try {
      const prompt = `You are an expert academic proofreader. Fix any grammatical errors, spelling mistakes, and awkward phrasing in the following text. Do NOT change the core meaning or expand the length unnecessarily. Output ONLY the corrected text, no markdown or conversational filler.\n\nText:\n${currentContent}`;
      const proofreadText = await callGeminiAPI(prompt);
      if (proofreadText) updateSection(sectionId, 'content', proofreadText);
    } catch (e) { window.alert(`AI Error: ${e.message}`); } finally { setProofreadingSectionId(null); }
  };

  const handleSuggestLiterature = async () => {
    const content = `Title: ${doc.title}\nAbstract: ${doc.abstract}`;
    if (!content.trim()) return;
    setIsSuggestingLiterature(true);
    try {
      const prompt = `You are an expert academic librarian. Based on this paper Title and Abstract, suggest 3 highly relevant, realistic-looking academic references in APA format. Output ONLY the references, separated by double newlines. Do not use numbering or bullets.\n\n${content}`;
      const suggestions = await callGeminiAPI(prompt);
      if (suggestions) {
        const newRefs = suggestions.split('\n\n').filter(r => r.trim()).map((ref, idx) => ({ id: Date.now() + idx, text: ref.trim() }));
        setDoc({ ...doc, references: [...(doc.references || []), ...newRefs] });
      }
    } catch (e) { window.alert(`AI Error: ${e.message}`); } finally { setIsSuggestingLiterature(false); }
  };

  const handleSuggestJournals = async () => {
    const content = `Title: ${doc.title}\nAbstract: ${doc.abstract}`;
    if (!content.trim()) return;
    setAiFeedbackModal({ isOpen: true, title: 'AI Journal Recommendations', content: '', isLoading: true });
    try {
      const prompt = `You are an expert academic advisor. Based on this paper's Title and Abstract, suggest 3 to 5 highly relevant, prestigious peer-reviewed academic journals where this paper could be published. Provide the journal name and a 1-sentence reason why it's a good fit. Output ONLY the list.\n\n${content}`;
      const recommendations = await callGeminiAPI(prompt);
      setAiFeedbackModal({ isOpen: true, title: 'Target Publication Journals', content: recommendations, isLoading: false });
    } catch (e) { setAiFeedbackModal({ isOpen: true, title: 'Error', content: `Failed to suggest journals: ${e.message}`, isLoading: false }); }
  };

  const handleAddCounterpoint = async (sectionId, currentContent) => {
    if (!currentContent.trim()) return;
    setAddingCounterpointId(sectionId);
    try {
      const prompt = `You are an expert academic writer. Read the following section of a paper and write one new paragraph that introduces a valid academic counter-argument, limitation, or alternative perspective. Maintain a formal, objective academic tone. Output ONLY the new paragraph, no introductions or markdown.\n\nSection:\n${currentContent}`;
      const counterpoint = await callGeminiAPI(prompt);
      if (counterpoint) {
        const newContent = currentContent + (currentContent.endsWith('\n') ? '\n' : '\n\n') + counterpoint;
        updateSection(sectionId, 'content', newContent);
      }
    } catch (e) { window.alert(`AI Error: ${e.message}`); } finally { setAddingCounterpointId(null); }
  };

  const handleGenerateGlossary = async () => {
    const content = `Title: ${doc.title}\nAbstract: ${doc.abstract}\n\nSections: ${(doc.sections || []).map(s => s.content).join('\n')}`;
    if (!content.trim()) return;
    setIsGeneratingGlossary(true);
    try {
      const prompt = `You are an expert academic editor. Read the following paper content and identify 5-10 key domain-specific technical terms, concepts, or acronyms used. Generate a formal glossary defining these terms in the context of the paper. Output ONLY the glossary text, with terms in bold (e.g., **Term:** Definition), no headers or markdown outside of the bolding.\n\n${content}`;
      const glossaryText = await callGeminiAPI(prompt);
      if (glossaryText) {
        setDoc({ ...doc, sections: [...doc.sections, { id: Date.now(), title: 'Glossary of Terms', content: glossaryText }] });
      }
    } catch (e) { window.alert(`AI Error: ${e.message}`); } finally { setIsGeneratingGlossary(false); }
  };

  const handleCheckClaims = async (sectionId, currentContent) => {
    if (!currentContent.trim()) return;
    setCheckingClaimsId(sectionId);
    setAiFeedbackModal({ isOpen: true, title: 'Citation Check', content: '', isLoading: true });
    try {
      const prompt = `You are a strict academic editor. Read the following section (which may contain mathematical notation or technical symbols) and extract any empirical claims, statistics, or factual assertions that typically require a citation to literature, but do not appear to have one. If the text is a mathematical proof or theoretical derivation, focus only on claims about the real-world or external work. Output as a clear bulleted list. If all claims are supported, say "No unsupported claims found."\n\nSection:\n${currentContent}`;
      const feedback = await callGeminiAPI(prompt);
      setAiFeedbackModal({ isOpen: true, title: 'Claims Needing Citations', content: feedback || "No unsupported claims found.", isLoading: false });
    } catch (e) { setAiFeedbackModal({ isOpen: true, title: 'Check Failed', content: `The claim check failed: ${e.message}`, isLoading: false }); } finally { setCheckingClaimsId(null); }
  };

  const handleGenerateSlides = async () => {
    const content = `Title: ${doc.title}\nAbstract: ${doc.abstract}\n\nSections: ${(doc.sections || []).map(s => s.title + "\n" + s.content).join('\n')}`;
    if (!content.trim()) return;
    setAiFeedbackModal({ isOpen: true, title: 'AI Slide Deck Generator', content: '', isLoading: true });
    try {
      const prompt = `You are an expert academic presenter. Convert the following academic paper into a professional slide deck presentation outline (typically 5-10 slides). For each slide, provide a Title and 3-4 concise bullet points summarizing the key info. Output ONLY the slide deck outline in a clean, readable text format.\n\nPaper Content:\n${content}`;
      const slides = await callGeminiAPI(prompt);
      setAiFeedbackModal({ isOpen: true, title: 'Slide Deck Outline', content: slides, isLoading: false });
    } catch (e) { setAiFeedbackModal({ isOpen: true, title: 'Error', content: `Failed to generate slide deck: ${e.message}`, isLoading: false }); }
  };

  const handleParaphraseSection = async (sectionId, currentContent) => {
    if (!currentContent.trim()) return;
    setParaphrasingSectionId(sectionId);
    try {
      const prompt = `You are an expert academic writer. Paraphrase the following text. Change the sentence structure and vocabulary entirely while retaining the exact original meaning and maintaining a formal academic tone. This is to ensure originality. Output ONLY the paraphrased text, no markdown or extra conversational text.\n\nText:\n${currentContent}`;
      const paraphrased = await callGeminiAPI(prompt);
      if (paraphrased) updateSection(sectionId, 'content', paraphrased);
    } catch (e) { window.alert(`AI Error: ${e.message}`); } finally { setParaphrasingSectionId(null); }
  };

  // --- Exports ---
  const exportLaTeX = () => {
    const layoutClass = doc.layout === 'double' ? 'twocolumn, ' : '';
    const latexContent = `
\\documentclass[12pt, ${layoutClass}a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{geometry}
\\geometry{a4paper, margin=1in}
\\usepackage{setspace}
\\usepackage{hyperref}
${doc.watermark ? '\\usepackage[text=' + (doc.status === 'Published' ? 'CONFIDENTIAL' : doc.status.toUpperCase()) + ',scale=1.5,color=black!10]{draftwatermark}' : ''}

\\title{\\textbf{${doc.title || 'Untitled'}}}
\\author{${doc.author || 'Author'} \\\\ \\textit{${doc.institution || ''}}}
\\date{${doc.date || '\\today'}}

\\begin{document}

\\maketitle

\\begin{abstract}
${doc.abstract || 'No abstract provided.'}
\\\\
\\vspace{0.5em}
\\noindent \\textbf{Keywords:} ${doc.keywords || 'None'}
\\end{abstract}

\\vspace{1em}
\\hrule
\\vspace{2em}

${doc.includeToC ? '\\tableofcontents\n\\vspace{2em}\n' : ''}

${doc.sections.map(sec => `
\\section*{${sec.title}}
${sec.content}
`).join('\n')}

${doc.references && doc.references.length > 0 ? `
\\section*{References}
\\begin{itemize}
${doc.references.map(ref => `\\item ${ref.text}`).join('\n')}
\\end{itemize}
` : ''}

\\end{document}
    `.trim();

    const blob = new Blob([latexContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(doc.title || 'document').replace(/\s+/g, '_')}.tex`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportMarkdown = () => {
    const mdContent = `
# ${doc.title || 'Untitled'}
**${doc.author || 'Author'}** | *${doc.institution || ''}*
*${doc.date || new Date().toLocaleDateString()}*

## Abstract
${doc.abstract || 'No abstract provided.'}

**Keywords:** ${doc.keywords || 'None'}

---

${doc.includeToC ? '## Table of Contents\n' + doc.sections.map(s => `- [${s.title}](#${s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')})`).join('\n') + '\n\n---\n\n' : ''}

${doc.sections.map(sec => `## ${sec.title}\n\n${sec.content}\n`).join('\n')}

${doc.references && doc.references.length > 0 ? `## References\n\n${doc.references.map((ref, i) => `${i + 1}. ${ref.text}`).join('\n')}` : ''}
    `.trim();

    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(doc.title || 'document').replace(/\s+/g, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => { window.print(); };

  return (
    <div className="flex flex-1 h-[calc(100vh-60px)] overflow-hidden print:h-auto print:overflow-visible">
      {/* LEFT PANEL */}
      <div className="w-1/2 lg:w-[500px] border-r border-slate-200 bg-white flex flex-col z-10 print:hidden shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <button onClick={onBack} className="text-sm font-medium text-slate-500 hover:text-indigo-600 flex items-center"><ChevronRight size={16} className="rotate-180 mr-1" /> Dashboard</button>
          <div className="flex items-center space-x-2 text-xs">
             <div className="hidden md:flex items-center text-xs text-slate-400 bg-white px-2 py-1 rounded border border-slate-200 mr-2">
                <BarChart2 size={12} className="mr-1 text-slate-300" />
                <span>{stats.words} words</span>
             </div>
             <span className={saveStatus === 'saved' ? 'text-emerald-500 flex items-center' : 'text-indigo-500 flex items-center'}>
                 {saveStatus === 'saved' ? <><CheckCircle2 size={12} className="mr-1"/> Synced</> : <><Save size={12} className="mr-1"/> Saving...</>}
             </span>
             <button onClick={exportMarkdown} className="p-1 text-slate-400 hover:text-indigo-600 ml-2" title="Export Markdown"><FileDown size={16}/></button>
             <button onClick={exportLaTeX} className="p-1 text-slate-400 hover:text-indigo-600" title="Export LaTeX"><FileCode2 size={16}/></button>
             <button onClick={exportPDF} className="bg-indigo-600 hover:bg-indigo-700 transition-colors text-white px-3 py-1.5 rounded flex items-center shadow-sm ml-1" title="Print/PDF"><Printer size={14} className="mr-1" /> PDF</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          <section>
            <div className="flex justify-between items-center mb-4">
               <h3 className="text-indigo-600 font-bold flex items-center"><LayoutTemplate size={18} className="mr-2" /> Metadata</h3>
               <button onClick={handleGenerateTitle} disabled={isGeneratingTitle || !doc.abstract} className="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors px-3 py-1.5 rounded-full flex items-center disabled:opacity-50 font-medium">
                 {isGeneratingTitle ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Sparkles size={12} className="mr-1.5" />} ✨ Suggest Title
               </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Document Title</label>
                <input type="text" value={doc.title} onChange={(e) => updateField('title', e.target.value)} placeholder="e.g., The Impact of Quantum Computing..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 font-medium" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Author Name</label>
                   <input type="text" value={doc.author} onChange={(e) => updateField('author', e.target.value)} placeholder="Jane Doe" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                   <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Date</label>
                   <input type="text" value={doc.date} onChange={(e) => updateField('date', e.target.value)} placeholder="October 2023" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Institution</label>
                <input type="text" value={doc.institution} onChange={(e) => updateField('institution', e.target.value)} placeholder="University" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Paper Layout</label>
                  <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button onClick={() => updateField('layout', 'single')} className={`flex-1 flex items-center justify-center py-1.5 text-sm font-medium rounded-md transition-all ${doc.layout !== 'double' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}><AlignLeft size={16} className="mr-2" /> Single</button>
                    <button onClick={() => updateField('layout', 'double')} className={`flex-1 flex items-center justify-center py-1.5 text-sm font-medium rounded-md transition-all ${doc.layout === 'double' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}><Columns size={16} className="mr-2" /> Double</button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Typography</label>
                  <select value={doc.fontStyle || 'serif'} onChange={(e) => updateField('fontStyle', e.target.value)} className="w-full px-3 py-[9px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm font-medium">
                    <option value="serif">Academic Serif</option>
                    <option value="sans">Modern Sans</option>
                    <option value="mono">Typewriter</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="flex justify-between items-center mb-4">
               <h3 className="text-indigo-600 font-bold flex items-center"><BookOpen size={18} className="mr-2" /> Abstract & Meta</h3>
               <div className="flex space-x-2">
                 <button onClick={handleSuggestJournals} disabled={!doc.title && !doc.abstract} className="text-xs font-medium bg-fuchsia-50 text-fuchsia-600 hover:bg-fuchsia-100 px-3 py-1.5 rounded-full flex items-center disabled:opacity-50">
                   <Target size={14} className="mr-1.5" /> ✨ Target Journals
                 </button>
                 <button onClick={handleGenerateAbstract} disabled={isGeneratingAbstract || doc.sections.length === 0} className="text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-full flex items-center disabled:opacity-50">
                   {isGeneratingAbstract ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Sparkles size={14} className="mr-1.5" />} ✨ Auto-Gen
                 </button>
               </div>
            </div>
            <div className="space-y-4">
              <textarea value={doc.abstract} onChange={(e) => updateField('abstract', e.target.value)} placeholder="Write a brief summary of your paper..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded h-32 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none custom-scrollbar" />
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Keywords</label>
                  <button onClick={handleSuggestKeywords} disabled={isGeneratingKeywords} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 disabled:opacity-50 flex items-center">
                    {isGeneratingKeywords ? <Loader2 size={12} className="animate-spin mr-1" /> : <Sparkles size={12} className="mr-1" />} ✨ Suggest Keywords
                  </button>
                </div>
                <input type="text" value={doc.keywords || ''} onChange={(e) => updateField('keywords', e.target.value)} placeholder="e.g., Quantum, Encryption, Computing" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
              </div>
            </div>
          </section>

          <section>
             <div className="flex items-center justify-between mb-4">
                <h3 className="text-indigo-600 font-bold flex items-center"><FileText size={18} className="mr-2" /> Document Content</h3>
                <div className="flex flex-wrap justify-end gap-2">
                  <button onClick={handleGenerateSlides} disabled={doc.sections.length === 0} className="text-xs font-medium bg-violet-50 text-violet-600 hover:bg-violet-100 px-3 py-1.5 rounded-full flex items-center disabled:opacity-50">
                    <Presentation size={14} className="mr-1.5" /> ✨ Slide Deck
                  </button>
                  <button onClick={handleGenerateGlossary} disabled={isGeneratingGlossary || doc.sections.length === 0} className="text-xs font-medium bg-cyan-50 text-cyan-600 hover:bg-cyan-100 px-3 py-1.5 rounded-full flex items-center disabled:opacity-50">
                    {isGeneratingGlossary ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Book size={14} className="mr-1.5" />} ✨ Glossary
                  </button>
                  <button onClick={handleGenerateOutline} disabled={isGeneratingOutline || (!doc.title && !doc.abstract)} className="text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-full flex items-center disabled:opacity-50">
                    {isGeneratingOutline ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <List size={14} className="mr-1.5" />} ✨ Auto-Outline
                  </button>
                  <button onClick={handleGenerateConclusion} disabled={isGeneratingConclusion || doc.sections.length === 0} className="text-xs font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-1.5 rounded-full flex items-center disabled:opacity-50">
                    {isGeneratingConclusion ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Sparkles size={14} className="mr-1.5" />} ✨ Auto-Conclusion
                  </button>
                </div>
             </div>

             <div className="space-y-6">
                {doc.sections.map((sec, index) => (
                  <div key={sec.id} className="p-4 border border-slate-200 rounded-lg bg-slate-50 relative group">
                    <div className="absolute -top-3 right-8 flex flex-wrap justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 max-w-[85%]">
                       <button onClick={() => handleParaphraseSection(sec.id, sec.content)} disabled={paraphrasingSectionId === sec.id} className="bg-teal-500 text-white text-xs font-medium hover:bg-teal-600 px-2.5 py-1 rounded-full shadow-sm flex items-center disabled:opacity-50">
                         {paraphrasingSectionId === sec.id ? <Loader2 size={12} className="mr-1 animate-spin" /> : <RefreshCw size={12} className="mr-1" />} ✨ Paraphrase
                       </button>
                       <button onClick={() => handleCheckClaims(sec.id, sec.content)} disabled={checkingClaimsId === sec.id} className="bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 px-2.5 py-1 rounded-full shadow-sm flex items-center disabled:opacity-50">
                         {checkingClaimsId === sec.id ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Search size={12} className="mr-1" />} ✨ Find Claims
                       </button>
                       <button onClick={() => handleCritiqueSection(sec.id, sec.content)} disabled={critiquingSectionId === sec.id} className="bg-rose-500 text-white text-xs font-medium hover:bg-rose-600 px-2.5 py-1 rounded-full shadow-sm flex items-center disabled:opacity-50">
                         {critiquingSectionId === sec.id ? <Loader2 size={12} className="mr-1 animate-spin" /> : <MessageSquare size={12} className="mr-1" />} ✨ Critique
                       </button>
                       <button onClick={() => handleAddCounterpoint(sec.id, sec.content)} disabled={addingCounterpointId === sec.id} className="bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 px-2.5 py-1 rounded-full shadow-sm flex items-center disabled:opacity-50">
                         {addingCounterpointId === sec.id ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Scale size={12} className="mr-1" />} ✨ Counterpoint
                       </button>
                       <button onClick={() => handleSimplifySection(sec.id, sec.content)} disabled={simplifyingSectionId === sec.id} className="bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 px-2.5 py-1 rounded-full shadow-sm flex items-center disabled:opacity-50">
                         {simplifyingSectionId === sec.id ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Sparkles size={12} className="mr-1" />} ✨ Simplify
                       </button>
                       <button onClick={() => handleContinueSection(sec.id, sec.content)} disabled={continuingSectionId === sec.id} className="bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 px-2.5 py-1 rounded-full shadow-sm flex items-center disabled:opacity-50">
                         {continuingSectionId === sec.id ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Plus size={12} className="mr-1" />} ✨ Continue
                       </button>
                       <button onClick={() => handleEnhanceSection(sec.id, sec.content)} disabled={enhancingSectionId === sec.id} className="bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 px-2.5 py-1 rounded-full shadow-sm flex items-center disabled:opacity-50">
                         {enhancingSectionId === sec.id ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Wand2 size={12} className="mr-1" />} ✨ Enhance
                       </button>
                       <button onClick={() => handleProofreadSection(sec.id, sec.content)} disabled={proofreadingSectionId === sec.id} className="bg-sky-500 text-white text-xs font-medium hover:bg-sky-600 px-2.5 py-1 rounded-full shadow-sm flex items-center disabled:opacity-50">
                         {proofreadingSectionId === sec.id ? <Loader2 size={12} className="mr-1 animate-spin" /> : <SpellCheck size={12} className="mr-1" />} ✨ Proofread
                       </button>
                    </div>
                    <div className="absolute -top-3 -right-3 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button onClick={() => moveSection(index, 'up')} disabled={index === 0} className="bg-white text-slate-400 hover:text-indigo-500 rounded-full p-1 shadow-sm border border-slate-200 disabled:opacity-50" title="Move Up"><ArrowUp size={14} /></button>
                      <button onClick={() => moveSection(index, 'down')} disabled={index === doc.sections.length - 1} className="bg-white text-slate-400 hover:text-indigo-500 rounded-full p-1 shadow-sm border border-slate-200 disabled:opacity-50" title="Move Down"><ArrowDown size={14} /></button>
                      <button onClick={() => removeSection(sec.id)} className="bg-white text-slate-400 hover:text-red-500 rounded-full p-1 shadow-sm border border-slate-200 ml-1" title="Remove"><Trash2 size={14} /></button>
                    </div>
                    {/* Add visual overlay when a specific section is loading */}
                    {(enhancingSectionId === sec.id || continuingSectionId === sec.id || simplifyingSectionId === sec.id || critiquingSectionId === sec.id || proofreadingSectionId === sec.id || addingCounterpointId === sec.id || checkingClaimsId === sec.id || paraphrasingSectionId === sec.id) && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-20 backdrop-blur-[1px] rounded-lg">
                        <Loader2 className="animate-spin text-indigo-600" size={24}/>
                      </div>
                    )}
                    <input value={sec.title} onChange={(e) => updateSection(sec.id, 'title', e.target.value)} placeholder={`Section ${index + 1} Heading`} className="w-full px-3 py-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-semibold mb-3" />
                    <textarea value={sec.content} onChange={(e) => updateSection(sec.id, 'content', e.target.value)} placeholder="Section content goes here..." className="w-full px-3 py-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm h-40 resize-y custom-scrollbar" />
                  </div>
                ))}
             </div>
             <button onClick={addSection} className="mt-4 w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 font-medium hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 transition-colors flex items-center justify-center"><PlusCircle size={18} className="mr-2" /> Add New Section</button>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center text-indigo-600 font-semibold"><Bookmark size={18} className="mr-2" /> References</div>
              <button onClick={handleSuggestLiterature} disabled={isSuggestingLiterature || (!doc.title && !doc.abstract)} className="flex items-center text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50">
                {isSuggestingLiterature ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Library size={14} className="mr-1.5" />} ✨ Suggest Literature
              </button>
            </div>
            <div className="space-y-3">
              {(doc.references || []).map((ref, index) => (
                <div key={ref.id} className="flex items-start gap-2 group relative">
                  <span className="text-slate-400 font-medium text-sm mt-2 w-5 text-right">[{index + 1}]</span>
                  <div className="flex-1 relative">
                    {formattingReferenceId === ref.id && <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-20"><Loader2 className="animate-spin text-indigo-600" size={16}/></div>}
                    <textarea value={ref.text} onChange={(e) => updateReference(ref.id, e.target.value)} placeholder="Enter raw link or messy citation..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm min-h-[60px] resize-y custom-scrollbar" />
                    <div className="absolute -top-3 right-10 flex opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button onClick={() => handleFormatReference(ref.id, ref.text)} disabled={formattingReferenceId === ref.id || !ref.text} className="bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 px-2.5 py-1 rounded-full shadow-sm flex items-center disabled:opacity-50">
                        {formattingReferenceId === ref.id ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Wand2 size={12} className="mr-1" />} ✨ Format APA
                      </button>
                    </div>
                    <div className="absolute top-2 right-2 flex flex-col space-y-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <div className="flex space-x-1 bg-white rounded shadow-sm border border-slate-100 p-0.5">
                        <button onClick={() => moveReference(index, 'up')} disabled={index === 0} className="text-slate-300 hover:text-indigo-500 p-0.5 disabled:opacity-30"><ArrowUp size={12} /></button>
                        <button onClick={() => moveReference(index, 'down')} disabled={index === doc.references.length - 1} className="text-slate-300 hover:text-indigo-500 p-0.5 disabled:opacity-30"><ArrowDown size={12} /></button>
                        <button onClick={() => removeReference(ref.id)} className="text-slate-300 hover:text-red-500 p-0.5 border-l border-slate-100 pl-1 ml-0.5"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addReference} className="mt-4 w-full py-2 border border-slate-200 bg-white rounded-lg text-slate-600 font-medium hover:bg-slate-50 hover:text-indigo-600 transition-colors flex items-center justify-center shadow-sm text-sm"><Plus size={16} className="mr-1" /> Add Citation</button>
          </section>
        </div>
      </div>

      {/* RIGHT PANEL: Live Preview */}
      <div className="flex-1 bg-slate-200/60 overflow-y-auto p-8 flex justify-center print:bg-white print:p-0 print:overflow-visible">
         <div id="printable-academic-doc" className={`bg-white shadow-xl max-w-[800px] w-full p-[10%] font-serif print:shadow-none min-h-[1131px] print:w-full print:max-w-none print:min-h-0 ${doc.fontStyle === 'sans' ? 'font-sans' : doc.fontStyle === 'mono' ? 'font-mono' : 'font-serif'}`}>
            <h1 className="text-3xl font-bold text-center mb-6 leading-snug">{doc.title || 'Untitled Document'}</h1>
            <div className="text-center mb-10 space-y-1">
              <p className="text-lg font-medium">{doc.author || 'Author Name'}</p>
              {doc.institution && <p className="italic text-slate-700">{doc.institution}</p>}
              {doc.date && <p className="text-slate-700">{doc.date}</p>}
            </div>

            {(doc.abstract || doc.title === '') && (
              <div className="mb-10 px-8">
                <h3 className="text-center font-bold text-sm uppercase tracking-widest mb-3">Abstract</h3>
                <p className="text-sm text-justify leading-relaxed italic mb-4">{doc.abstract || 'The abstract will appear here. It summarizes the core findings, methodology, and conclusions of the academic paper.'}</p>
                {doc.keywords && <p className="text-sm text-justify"><span className="font-bold">Keywords:</span> {doc.keywords}</p>}
              </div>
            )}

            <hr className="border-slate-300 mb-10" />

            {doc.includeToC && doc.sections.length > 0 && (
              <div className="mb-10 px-4 bg-slate-50/50 p-6 rounded-sm border border-slate-100">
                <h2 className="text-lg font-bold mb-4 uppercase tracking-wider text-center">Contents</h2>
                <div className="space-y-2">
                  {doc.sections.map((sec, idx) => sec.title ? (
                    <div key={`toc-${sec.id}`} className="flex items-end text-sm">
                      <a href={`#sec-${sec.id}`} className="font-medium hover:underline hover:text-indigo-600">{sec.title}</a>
                      <div className="flex-1 border-b border-dotted border-slate-400 mx-2 mb-1"></div>
                      <span className="text-slate-500 font-medium">Sec {idx + 1}</span>
                    </div>
                  ) : null)}
                  {doc.references && doc.references.length > 0 && (
                     <div className="flex items-end text-sm mt-4 pt-2 border-t border-slate-200">
                      <a href="#references" className="font-medium hover:underline hover:text-indigo-600">References</a>
                      <div className="flex-1 border-b border-dotted border-slate-400 mx-2 mb-1"></div>
                      <span className="text-slate-500 font-medium">Ref</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-8" style={{ columnCount: doc.layout === 'double' ? 2 : 1, columnGap: '3rem', columnRule: doc.layout === 'double' ? '1px solid #e2e8f0' : 'none' }}>
              {doc.sections.map((sec, index) => (
                <div key={sec.id} id={`sec-${sec.id}`} className="break-inside-avoid-column mb-8">
                  {sec.title && <h2 className="text-xl font-bold mb-3">{sec.title}</h2>}
                  <div className="text-base text-justify leading-relaxed space-y-4 whitespace-pre-wrap">{sec.content || (index === 0 && 'Content will begin here...')}</div>
                </div>
              ))}
              {doc.references && doc.references.length > 0 && (
                <div id="references" className="break-inside-avoid-column mt-8 pt-8 border-t border-slate-200">
                  <h2 className="text-xl font-bold mb-4">References</h2>
                  <div className="space-y-3">
                    {doc.references.map((ref, index) => (
                      <div key={ref.id} className="flex text-sm text-justify leading-relaxed">
                        <span className="font-medium mr-2">[{index + 1}]</span>
                        <span className="break-words">{ref.text || 'Empty citation...'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
         </div>
      </div>

      {/* AI Feedback Modal */}
      {aiFeedbackModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 print:hidden backdrop-blur-sm transition-all">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center">
                <MessageSquare size={16} className="text-indigo-600 mr-2" />
                {aiFeedbackModal.title}
              </h3>
              <button onClick={() => setAiFeedbackModal({ isOpen: false, title: '', content: '', isLoading: false })} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar">
              {aiFeedbackModal.isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-indigo-600">
                  <Loader2 size={32} className="animate-spin mb-4" />
                  <p className="text-sm font-medium">Processing your request...</p>
                </div>
              ) : (
                <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {aiFeedbackModal.content}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}