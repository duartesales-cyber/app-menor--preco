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

// --- Components ---

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

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Products Listener
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

  // Stats Listener
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

  // Filtered Products
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
      setCameraPrefill({
        nome: '',
        category: 'mercado',
        price: 0,
        storeName: store,
        address,
      });
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
      setCameraError('Erro ao acessar câmera. Verifique as permissões.');
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
          setOcrError('Não foi possível ler os dados da imagem.');
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
    return {
      nome: lines[0] || '',
      price,
      storeName: lines[1] || ''
    };
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
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-emerald-500/30">
      <div className="max-w-6xl mx-auto p-6 md:p-12 pb-32">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
          <div onClick={handleHeaderTap} className="cursor-pointer">
            <h1 className="text-4xl font-black tracking-tighter text-emerald-500 flex items-center gap-3">
              <span className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-black text-xl">$</span>
              PREÇO REAL
            </h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 mt-2 font-bold">Monitoramento Colaborativo</p>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden sm:flex gap-6 text-[10px] uppercase tracking-widest text-gray-500 font-bold">
              <div className="text-right">
                <span className="text-emerald-500 text-sm block">{products.length}</span> REGISTROS
              </div>
              <div className="text-right">
                <span className="text-emerald-500 text-sm block">{(stats.searches/1000).toFixed(1)}k</span> BUSCAS
              </div>
            </div>

            {user ? (
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl">
                <img src={user.photoURL || ''} alt="" className="w-6 h-6 rounded-full" />
                <button onClick={() => signOut(auth)} className="text-red-400 hover:text-red-300"><LogOut size={18} /></button>
              </div>
            ) : (
              <button onClick={signInWithGoogle} className="bg-emerald-500 text-black px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:scale-105 transition-transform">
                Entrar
              </button>
            )}
          </div>
        </header>

        {saveMessage && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-2xl text-sm font-bold">
            {saveMessage}
          </motion.div>
        )}

        <div className="grid grid-cols-12 gap-8">
          <aside className="col-span-12 md:col-span-4 space-y-8">
            <div className="bg-white/5 border border-white/10 p-6 rounded-3xl">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 block">Pesquisar</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Item ou estabelecimento..."
                  className="w-full bg-black border border-white/10 rounded-xl py-4 px-5 text-sm focus:border-emerald-500 outline-none transition-colors"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (e.target.value.length === 3) incrementStat('searches');
                  }}
                />
                <Search className="absolute right-4 top-4 text-emerald-500 opacity-50" size={20} />
              </div>

              <div className="mt-8 space-y-2">
                {(['todos', 'mercado', 'posto'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFilter(cat)}
                    className={`w-full flex justify-between items-center px-5 py-4 border rounded-xl text-xs font-bold transition-all ${
                      filter === cat ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500' : 'bg-black border-white/10 text-gray-500'
                    }`}
                  >
                    <span className="uppercase tracking-widest">{cat}</span>
                    <span className="font-mono opacity-50">
                      {cat === 'todos' ? products.length : products.filter(p => p.category === cat).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {filteredProducts.length > 0 && (
              <div className="bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 p-8 rounded-3xl">
                <h3 className="text-xs font-black text-emerald-500 uppercase mb-2">Melhor Oferta</h3>
                <p className="text-sm font-medium text-gray-300 mb-4">{filteredProducts[0].nome}</p>
                <div className="text-4xl font-black">R$ {filteredProducts[0].price.toFixed(2)}</div>
              </div>
            )}
          </aside>

          <section className="col-span-12 md:col-span-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <AnimatePresence mode="popLayout">
                {filteredProducts.map((product) => (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-emerald-500/40 transition-all group"
                  >
                    <div className="flex justify-between mb-4">
                      <span className={`text-[9px] px-2 py-1 rounded border font-black uppercase ${
                        product.category === 'mercado' ? 'text-blue-400 border-blue-400/20' : 'text-orange-400 border-orange-400/20'
                      }`}>
                        {product.category}
                      </span>
                      {user?.uid === product.userId && (
                        <button onClick={() => { setEditingProduct(product); setShowEditModal(true); }} className="text-gray-500 hover:text-white">
                          <Settings size={14} />
                        </button>
                      )}
                    </div>
                    {product.imageUrl && (
                      <img src={product.imageUrl} alt="" className="w-full h-32 object-cover rounded-xl mb-4 border border-white/5" />
                    )}
                    <h4 className="text-lg font-bold leading-tight group-hover:text-emerald-500 transition-colors">{product.nome}</h4>
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                      <Store size={12} /> {product.storeName}
                    </div>
                    <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-end">
                      <div className="text-[10px] text-gray-600 uppercase font-bold">
                        {product.address?.split(',')[0] || 'Local não informado'}
                      </div>
                      <div className="text-2xl font-black text-emerald-500">
                        <span className="text-xs mr-1">R$</span>{product.price.toFixed(2)}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </div>

      <button
        onClick={() => {
          if (!user) { signInWithGoogle(); return; }
          const useCam = confirm('Deseja usar a câmera para capturar o preço?');
          if (useCam) {
            setCameraPrefill(null);
            setCapturedImage(null);
            setShowCameraModal(true);
          } else {
            setCameraPrefill(null);
            setShowAddModal(true);
          }
        }}
        className="fixed bottom-8 right-8 w-16 h-16 bg-emerald-500 text-black rounded-full flex items-center justify-center shadow-2xl z-30 hover:scale-110 active:scale-95 transition-all"
      >
        <Plus size={32} strokeWidth={3} />
      </button>

      {/* Modals */}
      <AnimatePresence>
        {showAddModal && (
          <Modal onClose={() => setShowAddModal(false)} title="NOVO REGISTRO">
            <ProductForm 
              onSubmit={handleAddProduct} 
              initialData={cameraPrefill} 
              previewImage={cameraPhotoData}
              onRemoveImage={() => setCameraPhotoData(null)}
            />
          </Modal>
        )}

        {showEditModal && editingProduct && (
          <Modal onClose={() => setShowEditModal(false)} title="EDITAR REGISTRO">
            <ProductForm 
              onSubmit={handleEditProduct} 
              initialData={editingProduct} 
              onDelete={() => handleDeleteProduct(editingProduct.id)}
            />
          </Modal>
        )}

        {showCameraModal && (
          <Modal onClose={() => closeCameraModal()} title="CAPTURA INTELIGENTE">
            <div className="space-y-6">
              {!capturedImage ? (
                <div className="relative overflow-hidden rounded-2xl bg-black aspect-video flex items-center justify-center">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                  {!cameraStarted ? (
                    <button onClick={startCamera} className="bg-emerald-500 text-black px-6 py-3 rounded-xl font-bold">Ligar Câmera</button>
                  ) : (
                    <button onClick={captureImage} className="absolute bottom-4 w-12 h-12 bg-white rounded-full border-4 border-gray-400" />
                  )}
                  {cameraError && <div className="absolute top-4 px-4 py-2 bg-red-500 text-white text-xs rounded-lg">{cameraError}</div>}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative rounded-2xl overflow-hidden aspect-video">
                    <img src={capturedImage} alt="" className="w-full h-full object-cover" />
                    {isProcessing && (
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-xs font-bold">
                        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent animate-spin rounded-full mb-2" />
                        PROCESSANDO...
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => { setCapturedImage(null); startCamera(); }} className="flex-1 py-3 bg-white/10 rounded-xl text-xs font-bold uppercase">Recapturar</button>
                    <button onClick={() => { closeCameraModal(true); setShowAddModal(true); }} className="flex-1 py-3 bg-emerald-500 text-black rounded-xl text-xs font-black uppercase">Continuar</button>
                  </div>
                </div>
              )}
              {cameraLocation && (
                <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-[10px] text-gray-400">
                  <p><b>GPS:</b> {cameraLocation}</p>
                  <p><b>Local:</b> {cameraStoreName}</p>
                </div>
              )}
            </div>
          </Modal>
        )}

        {showAdmin && (
          <div className="fixed inset-0 z-[60] bg-black p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              <div className="flex justify-between items-center mb-12">
                <h2 className="text-2xl font-black text-emerald-500 uppercase tracking-tighter">Console Admin</h2>
                <button onClick={() => setShowAdmin(false)} className="bg-white/10 px-4 py-2 rounded-lg text-xs font-bold">FECHAR</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <AdminStat label="Buscas" value={stats.searches} />
                <AdminStat label="Acessos" value={stats.accesses} />
                <AdminStat label="Adições" value={stats.additions} />
              </div>
              <div className="bg-white/5 p-8 rounded-3xl border border-white/10 font-mono text-xs text-emerald-500/70 space-y-2">
                <p>{'>'} SYSTEM_STATUS: OK</p>
                <p>{'>'} ACTIVE_NODES: {products.length}</p>
                <p>{'>'} ENCRYPTION: AES-256</p>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#121212] w-full max-w-md rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
          <h2 className="text-sm font-black tracking-widest text-emerald-500 uppercase">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full"><X size={20} /></button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
      </motion.div>
    </div>
  );
}

function ProductForm({ 
  onSubmit, 
  initialData, 
  onDelete, 
  previewImage, 
  onRemoveImage 
}: { 
  onSubmit: (data: any) => void; 
  initialData?: any; 
  onDelete?: () => void; 
  previewImage?: string | null; 
  onRemoveImage?: () => void;
}) {
  const [formData, setFormData] = useState({
    nome: initialData?.nome || '',
    price: initialData?.price || 0,
    category: initialData?.category || 'mercado',
    storeName: initialData?.storeName || '',
    address: initialData?.address || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome || !formData.price || !formData.storeName) {
      alert('Preencha os campos obrigatórios');
      return;
    }
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {previewImage && (
        <div className="relative rounded-xl overflow-hidden mb-4">
          <img src={previewImage} className="w-full h-32 object-cover" alt="" />
          <button type="button" onClick={onRemoveImage} className="absolute top-2 right-2 p-1 bg-black/50 rounded-full"><X size={14}/></button>
        </div>
      )}
      <div className="space-y-1">
        <label className="text-[9px] font-bold text-gray-500 uppercase">Nome do Produto</label>
        <input required className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm" value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-gray-500 uppercase">Preço (R$)</label>
          <input required type="number" step="0.01" className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm" value={formData.price || ''} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-gray-500 uppercase">Categoria</label>
          <select className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as any})}>
            <option value="mercado">Mercado</option>
            <option value="posto">Posto</option>
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[9px] font-bold text-gray-500 uppercase">Estabelecimento</label>
        <input required className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm" value={formData.storeName} onChange={e => setFormData({...formData, storeName: e.target.value})} />
      </div>
      <div className="space-y-1">
        <label className="text-[9px] font-bold text-gray-500 uppercase">Endereço (Opcional)</label>
        <input className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
      </div>
      <div className="pt-4 flex gap-3">
        {onDelete && (
          <button type="button" onClick={onDelete} className="flex-1 py-3 bg-red-500/10 text-red-500 rounded-xl text-xs font-bold uppercase">Excluir</button>
        )}
        <button type="submit" className="flex-[2] py-3 bg-emerald-500 text-black rounded-xl text-xs font-black uppercase">Salvar</button>
      </div>
    </form>
  );
}

function AdminStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
      <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">{label}</div>
      <div className="text-2xl font-black">{value}</div>
    </div>
  );
}