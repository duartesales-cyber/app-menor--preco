/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, 
  MapPin, 
  Store, 
  Plus, 
  X, 
  Settings, 
  TrendingDown, 
  Filter, 
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  LogIn,
  LogOut,
  User as UserIcon,
  Camera,
  RotateCcw,
  CheckCircle,
  CloudLightning
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc,
  doc, 
  setDoc, 
  query, 
  orderBy,
  increment,
  updateDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { db, auth, signInWithGoogle } from './lib/firebase';
import { handleFirestoreError, OperationType } from './lib/firestore-errors';

// --- Types ---
interface Product {
  id: string;
  nome: string;
  price: number;
  category: 'mercado' | 'posto';
  storeName: string;
  address?: string;
  imageUrl?: string;
  userId: string;
  createdAt?: Timestamp;
}

interface Stats {
  searches: number;
  accesses: number;
  additions: number;
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'todos' | 'mercado' | 'posto'>('todos');
  const [showAdmin, setShowAdmin] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraPhotoData, setCameraPhotoData] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraError, setCameraError] = useState<string>('');
  const [ocrError, setOcrError] = useState<string>('');
  const [cameraLocation, setCameraLocation] = useState<string>('');
  const [cameraAddress, setCameraAddress] = useState<string>('');
  const [cameraStoreName, setCameraStoreName] = useState<string>('');
  const [geoError, setGeoError] = useState<string>('');
  const [cameraPrefill, setCameraPrefill] = useState<Partial<Product> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<Stats>({ searches: 0, accesses: 0, additions: 0 });
  const [tapCount, setTapCount] = useState(0);
  const tapTimer = useRef<NodeJS.Timeout | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState<string>('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProducts([]);
      return;
    }
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id, 
        ...doc.data() 
      } as Product));
      setProducts(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const statsDoc = doc(db, 'stats', 'global');
    const unsubscribe = onSnapshot(statsDoc, (snapshot) => {
      if (snapshot.exists()) {
        setStats(snapshot.data() as Stats);
      } else {
        setDoc(statsDoc, { searches: 0, accesses: 0, additions: 0 }).catch(() => {});
      }
    }, (error) => {
      console.warn("Stats error:", error);
    });
    return () => unsubscribe();
  }, []);

  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        const matchesSearch = 
          p.nome.toLowerCase().includes(search.toLowerCase()) || 
          p.storeName.toLowerCase().includes(search.toLowerCase());
        const matchesFilter = filter === 'todos' || p.category === filter;
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => a.price - b.price);
  }, [products, search, filter]);

  const incrementStat = async (field: keyof Stats) => {
    if (!user) return;
    try {
      const statsDoc = doc(db, 'stats', 'global');
      await updateDoc(statsDoc, { [field]: increment(1) });
    } catch (error) {
      console.warn("Failed to increment stats:", error);
    }
  };

  const handleHeaderTap = () => {
    setTapCount((prev) => prev + 1);
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => setTapCount(0), 2000);
    if (tapCount + 1 >= 5) {
      setTapCount(0);
      const pass = prompt('Acesso Admin:');
      if (pass === '1240') {
        setShowAdmin(true);
        incrementStat('accesses');
      } else if (pass !== null) {
        alert('Senha incorreta');
      }
    }
  };

  const handleAddProduct = async (newProduct: Omit<Product, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) return;
    let imageUrl: string | undefined;
    if (cameraPhotoData) {
      try {
        const formData = new FormData();
        formData.append('file', cameraPhotoData);
        formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '');
        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`,
          { method: 'POST', body: formData }
        );
        const data = await res.json();
        imageUrl = data.secure_url;
      } catch (uploadError) {
        console.error('Upload error:', uploadError);
      }
    } 
    try {
      await addDoc(collection(db, 'products'), {
        ...newProduct,
        imageUrl: imageUrl || null,
        userId: user.uid,
        createdAt: serverTimestamp(),
      });
      incrementStat('additions');
      setSaveMessage('Produto salvo com sucesso!');
      setShowAddModal(false);
      setCameraPrefill(null);
      setCameraPhotoData(null);
      setCapturedImage(null);
      setTimeout(() => setSaveMessage(''), 4500);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'products');
    }
  };

  const handleEditProduct = async (updatedProduct: Omit<Product, 'id' | 'createdAt' | 'userId'>) => {
    if (!user || !editingProduct) return;
    try {
      const productRef = doc(db, 'products', editingProduct.id);
      await updateDoc(productRef, {
        ...updatedProduct,
        updatedAt: serverTimestamp(),
      });
      setShowEditModal(false);
      setEditingProduct(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'products');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!user || !confirm('Deseja realmente excluir este produto?')) return;
    try {
      await deleteDoc(doc(db, 'products', productId));
      setShowEditModal(false);
      setEditingProduct(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
    }
  };

  const fetchLocationData = async (latitude: number, longitude: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
      );
      const data = await response.json();
      const store = data.name || data.address?.commercial || data.address?.road || 'Estabelecimento local';
      const address = data.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      setCameraStoreName(store);
      setCameraAddress(address);
      setCameraLocation(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      setCameraPrefill({ nome: '', category: 'mercado', price: 0, storeName: store, address });
    } catch (error) {
      setGeoError('Erro ao converter GPS em endereço.');
      setCameraLocation(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
    }
  };

  const getGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoError('GPS não suportado.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchLocationData(pos.coords.latitude, pos.coords.longitude),
      () => setGeoError('Permissão de GPS negada.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraStarted(true);
    } catch (error: any) {
      setCameraError('Erro ao acessar câmera.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
  };

  const captureImage = async () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(imageData);
        setCameraPhotoData(imageData);
        stopCamera();
        setIsProcessing(true);
        getGeolocation();
        try {
          const text = await callOcrApi(imageData);
          const extracted = parseOcrText(text);
          setCameraPrefill(prev => ({
            ...prev,
            nome: extracted.nome || prev?.nome,
            price: extracted.price || prev?.price,
            storeName: extracted.storeName || prev?.storeName
          }));
        } catch (e) {
          setOcrError('Erro no OCR.');
        } finally {
          setIsProcessing(false);
        }
      }
    }
  };

  const callOcrApi = async (dataUrl: string) => {
    const formData = new FormData();
    formData.append('apikey', 'helloworld'); 
    formData.append('base64Image', dataUrl);
    formData.append('language', 'por');
    const res = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: formData });
    const result = await res.json();
    return result.ParsedResults?.[0]?.ParsedText || '';
  };

  const parseOcrText = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const priceMatch = text.match(/(?:R\$|RS|r\$)?\s*([0-9]+(?:[.,][0-9]{2}))/i);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : 0;
    return { nome: lines[0] || '', price, storeName: lines[1] || '' };
  };

  const closeCameraModal = (preserve = false) => {
    stopCamera();
    setShowCameraModal(false);
    if (!preserve) {
      setCapturedImage(null);
      setCameraPhotoData(null);
    }
    setCameraStarted(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f172a]">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], rotate: 360 }} 
          transition={{ repeat: Infinity, duration: 2 }} 
          className="w-12 h-12 border-2 border-emerald-400 border-t-transparent rounded-full shadow-[0_0_20px_rgba(52,211,153,0.3)]" 
        />
        <span className="mt-4 text-slate-500 font-medium tracking-widest text-[10px] uppercase">Carregando Ecossistema</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 selection:bg-cyan-500/30 font-sans antialiased">
      <div className="max-w-7xl mx-auto px-6 py-8 md:py-16">
        
        {/* Navigation / Header */}
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-20 gap-8">
          <div onClick={handleHeaderTap} className="cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform duration-300">
                <CloudLightning className="text-[#0f172a]" size={24} />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tighter text-white">PREÇO<span className="text-emerald-400">REAL</span></h1>
                <div className="h-1 w-12 bg-emerald-500/30 rounded-full mt-1" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-8 bg-slate-900/40 backdrop-blur-md border border-white/5 p-2 pr-6 rounded-2xl">
            <div className="hidden sm:flex gap-8 px-6 border-r border-white/10">
              <div className="text-center">
                <span className="block text-cyan-400 font-bold text-lg leading-none">{products.length}</span>
                <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Registros</span>
              </div>
              <div className="text-center">
                <span className="block text-emerald-400 font-bold text-lg leading-none">{(stats.searches/1000).toFixed(1)}k</span>
                <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Buscas</span>
              </div>
            </div>

            {user ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="text-right hidden md:block">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight leading-none">{user.displayName}</p>
                    <p className="text-[9px] text-emerald-500/70 font-mono">Verificado</p>
                  </div>
                  <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-xl border-2 border-white/10 shadow-xl" />
                </div>
                <button onClick={() => signOut(auth)} className="p-2 text-rose-400 hover:bg-rose-400/10 rounded-xl transition-all duration-300">
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button onClick={signInWithGoogle} className="bg-white text-black px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-400 transition-all duration-300 shadow-xl">
                Autenticar
              </button>
            )}
          </div>
        </header>

        <AnimatePresence>
          {saveMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -20, scale: 0.95 }} 
              animate={{ opacity: 1, y: 0, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              className="mb-10 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-center text-sm font-bold backdrop-blur-sm"
            >
              {saveMessage}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-12 gap-10">
          {/* Sidebar */}
          <aside className="col-span-12 lg:col-span-4 space-y-10">
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-8 rounded-[2rem] shadow-2xl">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <Search size={12} className="text-emerald-500" /> Inteligência de Filtro
              </h3>
              
              <div className="relative mb-8">
                <input
                  type="text"
                  placeholder="Buscar produto ou local..."
                  className="w-full bg-[#0a0f1d] border border-white/5 rounded-2xl py-4 pl-12 pr-5 text-sm text-white focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 outline-none transition-all duration-300"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (e.target.value.length === 3) incrementStat('searches');
                  }}
                />
                <Search className="absolute left-4 top-4 text-slate-600" size={18} />
              </div>

              <div className="space-y-3">
                {(['todos', 'mercado', 'posto'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFilter(cat)}
                    className={`w-full group flex justify-between items-center px-6 py-4 rounded-2xl text-xs font-bold transition-all duration-300 border ${
                      filter === cat 
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/5' 
                      : 'bg-transparent border-white/5 text-slate-500 hover:border-white/10 hover:bg-white/5'
                    }`}
                  >
                    <span className="uppercase tracking-widest">{cat}</span>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-mono ${filter === cat ? 'bg-emerald-500 text-[#0f172a]' : 'bg-slate-800'}`}>
                      {cat === 'todos' ? products.length : products.filter(p => p.category === cat).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {filteredProducts.length > 0 && (
              <div className="relative overflow-hidden bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/20 p-8 rounded-[2rem] group">
                <div className="absolute -right-8 -top-8 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
                <h3 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-2">Destaque Econômico</h3>
                <p className="text-sm font-medium text-slate-300 mb-6 truncate">{filteredProducts[0].nome}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-bold text-cyan-500/50 uppercase">R$</span>
                  <div className="text-5xl font-black text-white tracking-tighter">
                    {filteredProducts[0].price.toFixed(2).split('.')[0]}
                    <span className="text-2xl text-cyan-400">.{filteredProducts[0].price.toFixed(2).split('.')[1]}</span>
                  </div>
                </div>
              </div>
            )}
          </aside>

          {/* Main Content */}
          <section className="col-span-12 lg:col-span-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <AnimatePresence mode="popLayout">
                {filteredProducts.map((product) => (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="group bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-3xl p-6 hover:border-emerald-500/30 hover:bg-slate-900/60 transition-all duration-300 shadow-xl"
                  >
                    <div className="flex justify-between items-start mb-6">
                      <span className={`text-[9px] px-3 py-1 rounded-full border font-black uppercase tracking-tighter ${
                        product.category === 'mercado' ? 'text-blue-400 border-blue-400/20 bg-blue-400/5' : 'text-amber-400 border-amber-400/20 bg-amber-400/5'
                      }`}>
                        {product.category}
                      </span>
                      {user?.uid === product.userId && (
                        <button 
                          onClick={() => { setEditingProduct(product); setShowEditModal(true); }} 
                          className="p-2 text-slate-600 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                        >
                          <Settings size={14} />
                        </button>
                      )}
                    </div>

                    {product.imageUrl && (
                      <div className="relative mb-6 rounded-2xl overflow-hidden aspect-[16/9] border border-white/5">
                        <img src={product.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] to-transparent opacity-60" />
                      </div>
                    )}

                    <h4 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors leading-snug mb-2">{product.nome}</h4>
                    
                    <div className="flex flex-col gap-1 mb-8">
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                        <Store size={12} className="text-emerald-500" /> {product.storeName}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-600 uppercase font-bold">
                        <MapPin size={10} /> {product.address?.split(',')[0] || 'Localização Omissa'}
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-5 border-t border-white/5">
                      <div className="text-[9px] text-slate-500 font-mono">
                        {product.createdAt ? new Date(product.createdAt.toDate()).toLocaleDateString() : 'Recente'}
                      </div>
                      <div className="text-3xl font-black text-cyan-400 flex items-baseline gap-1">
                        <span className="text-xs font-bold text-cyan-500/40">R$</span>
                        {product.price.toFixed(2)}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            
            {filteredProducts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                <AlertCircle size={48} strokeWidth={1} className="mb-4 opacity-20" />
                <p className="text-sm font-medium">Nenhum registro encontrado para esta busca.</p>
              </div>
            )}
          </section>
        </div>
      </div>

      <button
        onClick={() => {
          if (!user) { signInWithGoogle(); return; }
          const useCam = confirm('Deseja utilizar OCR para capturar automaticamente?');
          if (useCam) {
            setCameraPrefill(null);
            setCapturedImage(null);
            setShowCameraModal(true);
          } else {
            setCameraPrefill(null);
            setShowAddModal(true);
          }
        }}
        className="fixed bottom-10 right-10 w-16 h-16 bg-emerald-500 text-[#0f172a] rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-500/20 z-30 hover:scale-110 hover:-rotate-6 active:scale-95 transition-all duration-300"
      >
        <Plus size={32} strokeWidth={3} />
      </button>

      {/* MODALS */}
      <AnimatePresence>
        {(showAddModal || showEditModal) && (
          <Modal onClose={() => { setShowAddModal(false); setShowEditModal(false); }} title={showAddModal ? "Novo Registro" : "Modificar Dados"}>
            <ProductForm 
              onSubmit={showAddModal ? handleAddProduct : handleEditProduct} 
              initialData={showAddModal ? cameraPrefill : editingProduct} 
              previewImage={cameraPhotoData}
              onRemoveImage={() => setCameraPhotoData(null)}
              onDelete={showEditModal && editingProduct ? () => handleDeleteProduct(editingProduct.id) : undefined}
            />
          </Modal>
        )}

        {showCameraModal && (
          <Modal onClose={() => closeCameraModal()} title="Scanner IA">
            <div className="space-y-6">
              {!capturedImage ? (
                <div className="relative overflow-hidden rounded-3xl bg-[#0a0f1d] aspect-square flex items-center justify-center border border-white/10">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                  {!cameraStarted ? (
                    <button onClick={startCamera} className="bg-emerald-500 text-black px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Ativar Lente</button>
                  ) : (
                    <button onClick={captureImage} className="absolute bottom-8 w-16 h-16 bg-white/20 backdrop-blur-md rounded-full border-4 border-white flex items-center justify-center group">
                       <div className="w-12 h-12 bg-white rounded-full group-active:scale-90 transition-transform" />
                    </button>
                  )}
                  {cameraError && <div className="absolute top-4 px-4 py-2 bg-rose-500 text-white text-[10px] font-black rounded-lg uppercase">{cameraError}</div>}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="relative rounded-3xl overflow-hidden aspect-square border border-white/10">
                    <img src={capturedImage} alt="" className="w-full h-full object-cover" />
                    {isProcessing && (
                      <div className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-md flex flex-col items-center justify-center">
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full mb-4" />
                        <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Extraindo Metadados</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-4">
                    <button onClick={() => { setCapturedImage(null); startCamera(); }} className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">Descartar</button>
                    <button onClick={() => { closeCameraModal(true); setShowAddModal(true); }} className="flex-1 py-4 bg-emerald-500 text-[#0f172a] rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20">Validar</button>
                  </div>
                </div>
              )}
            </div>
          </Modal>
        )}

        {showAdmin && (
          <div className="fixed inset-0 z-[100] bg-[#0f172a] p-8 md:p-20 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              <div className="flex justify-between items-end mb-20">
                <div>
                  <h2 className="text-4xl font-black text-white uppercase tracking-tighter">Terminal <span className="text-emerald-500">Privado</span></h2>
                  <p className="text-slate-500 text-xs font-mono mt-2">Acesso Nível 4 - Monitoramento em tempo real</p>
                </div>
                <button onClick={() => setShowAdmin(false)} className="bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 px-6 py-3 rounded-xl text-[10px] font-black transition-all border border-white/5 uppercase tracking-widest">Sair</button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
                <AdminStat label="Queries Realizadas" value={stats.searches} color="cyan" />
                <AdminStat label="Sessões Admin" value={stats.accesses} color="emerald" />
                <AdminStat label="Assets Catalogados" value={stats.additions} color="amber" />
              </div>

              <div className="bg-[#0a0f1d] p-10 rounded-[2.5rem] border border-white/5 font-mono text-xs text-emerald-500/60 leading-loose shadow-2xl">
                <p>{'>'} STATUS: SYSTEM_ONLINE</p>
                <p>{'>'} KERNEL: V4.0.1-PREMIUM</p>
                <p>{'>'} DB_NODES_ACTIVE: {products.length}</p>
                <p>{'>'} ANALYTICS: AGGREGATING...</p>
                <p>{'>'} SECURITY: BIOMETRIC_ENFORCED</p>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Subcomponents ---

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-[#0f172a]/90 backdrop-blur-xl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }} 
        animate={{ opacity: 1, scale: 1, y: 0 }} 
        className="bg-slate-900 border border-white/10 w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]"
      >
        <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-white/5">
          <h2 className="text-xs font-black tracking-[0.2em] text-emerald-400 uppercase">{title}</h2>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-full transition-all"><X size={20} /></button>
        </div>
        <div className="p-8 max-h-[75vh] overflow-y-auto custom-scrollbar">{children}</div>
      </motion.div>
    </div>
  );
}

function ProductForm({ onSubmit, initialData, onDelete, previewImage, onRemoveImage }: { onSubmit: (data: any) => void; initialData?: any; onDelete?: () => void; previewImage?: string | null; onRemoveImage?: () => void; }) {
  const [formData, setFormData] = useState({
    nome: initialData?.nome || '',
    price: initialData?.price || 0,
    category: initialData?.category || 'mercado',
    storeName: initialData?.storeName || '',
    address: initialData?.address || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome || !formData.price || !formData.storeName) return;
    onSubmit(formData);
  };

  const inputClass = "w-full bg-[#0a0f1d] border border-white/5 rounded-2xl p-4 text-sm text-white focus:border-emerald-500/50 outline-none transition-all placeholder:text-slate-700";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block ml-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {previewImage && (
        <div className="relative rounded-2xl overflow-hidden border border-white/10">
          <img src={previewImage} className="w-full h-40 object-cover" alt="" />
          <button type="button" onClick={onRemoveImage} className="absolute top-3 right-3 p-2 bg-[#0f172a]/80 backdrop-blur-md text-white rounded-xl hover:bg-rose-500 transition-colors">
            <X size={16}/>
          </button>
        </div>
      )}
      
      <div>
        <label className={labelClass}>Identificação do Item</label>
        <input required placeholder="Ex: Arroz Tio João 5kg" className={inputClass} value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Valor Unitário (R$)</label>
          <input required type="number" step="0.01" className={inputClass} value={formData.price || ''} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} />
        </div>
        <div>
          <label className={labelClass}>Segmento</label>
          <select className={inputClass} value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as any})}>
            <option value="mercado">Mercado</option>
            <option value="posto">Posto</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Estabelecimento</label>
        <input required placeholder="Ex: Carrefour" className={inputClass} value={formData.storeName} onChange={e => setFormData({...formData, storeName: e.target.value})} />
      </div>

      <div>
        <label className={labelClass}>Localização (Opcional)</label>
        <input placeholder="Rua, Bairro ou Referência" className={inputClass} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
      </div>

      <div className="pt-6 flex gap-4">
        {onDelete && (
          <button type="button" onClick={onDelete} className="flex-1 py-4 border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">Excluir</button>
        )}
        <button type="submit" className="flex-[2] py-4 bg-emerald-500 text-[#0f172a] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:shadow-lg hover:shadow-emerald-500/20 transition-all">Confirmar Registro</button>
      </div>
    </form>
  );
}

function AdminStat({ label, value, color }: { label: string; value: number, color: 'cyan' | 'emerald' | 'amber' }) {
  const colors = {
    cyan: 'text-cyan-400 bg-cyan-400/5 border-cyan-400/10',
    emerald: 'text-emerald-400 bg-emerald-400/5 border-emerald-400/10',
    amber: 'text-amber-400 bg-amber-400/5 border-amber-400/10'
  };
  
  return (
    <div className={`p-8 rounded-3xl border ${colors[color]} backdrop-blur-md`}>
      <div className="text-[10px] font-black uppercase tracking-widest mb-4 opacity-60">{label}</div>
      <div className="text-4xl font-black tracking-tighter">{value.toLocaleString()}</div>
    </div>
  );
}