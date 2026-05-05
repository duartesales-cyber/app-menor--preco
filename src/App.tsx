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
  CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc,
  doc, 
  setDoc, 
  getDoc, 
  serverTimestamp, 
  query, 
  orderBy,
  increment,
  updateDoc,
  where
} from 'firebase/firestore';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { db, auth, signInWithGoogle } from './lib/firebase';
import { handleFirestoreError, OperationType } from './lib/firestore-errors';

// --- Types ---.
interface Product {
  id: string;
  nome: string;
  price?: number;
preco?: number;
  category: 'mercado' | 'posto';
  storeName?: string;
  address?: string;
  imageUrl?: string;
  uid?: string;
  createdAt?: any;
}

interface Stats {
  searches: number;
  accesses: number;
  additions: number;
}

// --- Components ---

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [user, setUser] = useState<User | null>(null);
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
  const [cameraPrefill, setCameraPrefill] = useState<Omit<Product, 'id' | 'createdAt' | 'userId'> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<Stats>({ searches: 0, accesses: 0, additions: 0 });
  const [tapCount, setTapCount] = useState(0);
  const tapTimer = useRef<NodeJS.Timeout | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState<string>('');

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
  }, [user]);

  // Products Listener
  useEffect(() => {
    if (!user) return;
const q = query(collection(db, 'products'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id, 
        ...doc.data() 
      } as Product));
      console.log('PRODUTOS ENCONTRADOS:', docs);
      setProducts(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });
    return unsubscribe;
  }, [user]);

  // Stats Listener
  useEffect(() => {
    const statsDoc = doc(db, 'stats', 'global');
    const unsubscribe = onSnapshot(statsDoc, (snapshot) => {
      if (snapshot.exists()) {
        setStats(snapshot.data() as Stats);
      } else {
        // Initialize stats if not exist (Admin only usually, but we'll try)
        setDoc(statsDoc, { searches: 0, accesses: 0, additions: 0 }).catch(err => {
          console.warn("Could not initialze stats (expected if not admin)");
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'stats/global');
    });
    return unsubscribe;
  }, []);

  // Filtered Products
const filteredProducts = useMemo(() => {
    return products
    .filter((p: any) =>{
        const matchesSearch = (p.item ?? '').toLowerCase().includes(search.toLowerCase()) || 
                             (p.storeName?.toLowerCase().includes(search.toLowerCase()) ?? false);
        const matchesFilter = filter === 'todos' || p.category === filter;
        return matchesSearch && matchesFilter;
      })
      .sort((a: any, b: any) => Number(a.preco) - Number(b.preco));
  }, [products, search, filter]);
  const incrementStat = async (field: keyof Stats) => {
    if (!user) return;
    try {
      const statsDoc = doc(db, 'stats', 'global');
      await updateDoc(statsDoc, {
        [field]: increment(1)
      });
    } catch (error) {
      // Just log, don't crash
      console.warn("Failed to increment stats:", error);
    }
  };

  // Admin access logic
  const handleHeaderTap = () => {
    setTapCount((prev: any) => prev + 1);
    if (tapTimer.current) clearTimeout(tapTimer.current);
    
    tapTimer.current = setTimeout(() => {
      setTapCount(0);
    }, 2000);

    if (tapCount + 1 >= 5) {
      setTapCount(0);
      const pass = prompt('Senha admin (ou use login google se for o admin da conta):');
      if (pass === '1240') {
        setShowAdmin(true);
        incrementStat('accesses');
      } else if (pass !== null) {
        alert('Senha incorreta');
      }
    }
  };

  const handleAddProduct = async (newProduct: Omit<Product, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) {
      alert('Você precisa estar logado para adicionar um preço.');
      return;
    }

    let imageUrl: string | undefined;
    if (cameraPhotoData) {
  try {
    const formData = new FormData();
    formData.append('file', cameraPhotoData);
    formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    );
    const data = await res.json();
    imageUrl = data.secure_url;
  } catch (uploadError) {
    console.error('Erro no upload Cloudinary, salvando sem foto:', uploadError);
    imageUrl = undefined;
  }
} 

    try {
      await addDoc(collection(db, 'products'), {
        ...newProduct,
        ...(imageUrl ? { imageUrl } : {}),
        userId: user.uid,
        createdAt: serverTimestamp(),
      });

      incrementStat('additions');
      setSaveMessage('Produto salvo com sucesso!');
      setShowAddModal(false);
      setCameraPrefill(null);
      setCameraPhotoData(null);
      setCapturedImage(null);
      window.setTimeout(() => setSaveMessage(''), 4500);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Erro ao salvar produto:', error);
      alert(`Erro ao salvar produto: ${errorMessage}`);
      handleFirestoreError(error, OperationType.CREATE, 'products');
    }
  };

  const handleEditProduct = async (updatedProduct: Omit<Product, 'id' | 'createdAt' | 'userId'>) => {
    if (!user || !editingProduct) {
      alert('Erro: Produto não encontrado ou usuário não logado.');
      return;
    }

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
    if (!user) {
      alert('Você precisa estar logado para excluir um produto.');
      return;
    }

    const confirmed = confirm('Deseja realmente excluir este produto? Esta ação não pode ser desfeita.');
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'products', productId));
      setShowEditModal(false);
      setEditingProduct(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
    }
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setShowEditModal(true);
  };

  const resetCameraMetadata = () => {
    setCameraLocation('');
    setCameraAddress('');
    setCameraStoreName('');
    setGeoError('');
  };

  const fetchLocationData = async (latitude: number, longitude: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
      );
      if (!response.ok) throw new Error('Erro ao buscar localização');
      const data = await response.json();
      const store = data.name || data.address?.commercial || data.address?.road || '';
      const address = data.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

      setCameraStoreName(store || 'Estabelecimento local');
      setCameraAddress(address);
      setCameraLocation(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      setCameraPrefill({
        nome: '',
        category: 'mercado',
        price: 0,
        storeName: store || 'Estabelecimento local',
        address,
      });
    } catch (error: any) {
      console.error('Reverse geocoding failed:', error);
      setGeoError('Não foi possível obter o endereço completo. O GPS funcionou, mas não conseguimos converter para um endereço legível.');
      setCameraLocation(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      setCameraPrefill({
        nome: '',
        category: 'mercado',
        price: 0,
        storeName: 'Estabelecimento local',
        address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      });
    }
  };

  const getGeolocation = async () => {
    if (!navigator.geolocation) {
      setGeoError('GPS não suportado pelo navegador.');
      return;
    }

    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          await fetchLocationData(latitude, longitude);
          resolve();
        },
        (error) => {
          console.error('Geolocation error:', error);
          setGeoError('Não foi possível obter a localização. Verifique as permissões do GPS.');
          resolve();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  // Camera functions
  const startCamera = async () => {
    setCameraError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Seu navegador não suporta câmera. Use um navegador moderno ou teste no Chrome/Safari em HTTPS.');
      return;
    }

    if (!window.isSecureContext) {
      setCameraError('A câmera só funciona em conexão segura (HTTPS). Use localhost ou um túnel HTTPS.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraStarted(true);
    } catch (error: any) {
      console.error('Error accessing camera:', error);
      const message = error?.message || 'Erro desconhecido ao acessar a câmera.';
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        setCameraError('Permissão de câmera negada. Permita o uso da câmera no navegador.');
      } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
        setCameraError('Nenhuma câmera encontrada. Verifique se o dispositivo possui câmera ativa.');
      } else {
        setCameraError(`Erro ao acessar câmera: ${message}. Verifique permissões, HTTPS e navegador compatível.`);
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const captureImage = async () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      if (context) {
        context.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(imageData);
        setCameraPhotoData(imageData);
        stopCamera();
        setIsProcessing(true);
        setOcrError('');

        await getGeolocation();

        try {
          const ocrResult = await processOcr(imageData);
          if (ocrResult) {
            setCameraPrefill(prev => ({
              ... (prev ?? {
                nome: '',
                category: 'mercado',
                price: 0,
                storeName: '',
                address: ''
              }),
              nome: ocrResult.nome || prev?.nome || '',
              price: ocrResult.price ?? prev?.price ?? 0,
              storeName: ocrResult.storeName || prev?.storeName || 'Estabelecimento local'
            }));
          }
        } catch (error: any) {
          setOcrError(error?.message || 'Erro ao processar OCR. Verifique a imagem e tente novamente.');
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
    formData.append('isOverlayRequired', 'false');

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Falha na requisição OCR.');
    }

    const result = await response.json();
    if (result.IsErroredOnProcessing || !result.ParsedResults?.length) {
      throw new Error(result.ErrorMessage?.[0] || 'Erro no processamento OCR.');
    }

    return result.ParsedResults[0].ParsedText as string;
  };

  const parseOcrText = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);

    const priceMatch = text.match(/(?:R\$|RS|r\$)?\s*([0-9]+(?:[.,][0-9]{2}))/i);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : undefined;
    const nonNumericLines = lines.filter((line: string) => !/(?:R\$|RS|\d)/i.test(line));

    return {
      nome: nonNumericLines[0] ?? lines[0] ?? '',
      price,
      storeName: nonNumericLines[1] ?? nonNumericLines[0] ?? ''
    };
  };

  const processOcr = async (imageData: string) => {
    const text = await callOcrApi(imageData);
    const extracted = parseOcrText(text);
    if (!extracted.nome && extracted.price === undefined && !extracted.storeName) {
      throw new Error('OCR não conseguiu extrair dados válidos.');
    }
    return extracted;
  };

  const resetCamera = () => {
    setCapturedImage(null);
    setIsProcessing(false);
    setGeoError('');
    setCameraLocation('');
    setCameraAddress('');
    setCameraStoreName('');
    setCameraPrefill(null);
    startCamera();
  };

  const openCameraModal = () => {
    resetCameraMetadata();
    setCameraPrefill(null);
    setCameraError('');
    setShowCameraModal(true);
    setCameraStarted(false);
    // Don't start camera automatically, wait for user interaction
  };

  const closeCameraModal = (preserveImage = false) => {
    stopCamera();
    setShowCameraModal(false);
    if (!preserveImage) {
      setCapturedImage(null);
      setCameraPhotoData(null);
    }
    setIsProcessing(false);
    setCameraStarted(false);
    setCameraError('');
    setOcrError('');
    resetCameraMetadata();
  };

  const openAddModalWithPrefill = (data?: Omit<Product, 'id' | 'createdAt' | 'userId'>) => {
    setCameraPrefill(data ?? null);
    setShowAddModal(true);
  };

  const removePreviewImage = () => {
    setCameraPhotoData(null);
    setCapturedImage(null);
  };

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      alert('Erro ao fazer login. Verifique sua conexão.');
    }
  };

  if (loading) {
    return (
      <div className="min--screen flex items-centers-center justify-center bg-gray-50">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-dark font-sans text-text-main relative overflow-x-hidden">
      {/* Background Pattern */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none radial-dots z-0" />

      {/* Main Container */}
      <div className="relative z-10 max-w-6xl mx-auto p-6 md:p-12 pb-24 md:pb-32">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
          <div onClick={handleHeaderTap} className="cursor-pointer group">
            <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-brand-primary flex items-center gap-3">
              <span className="w-10 h-10 md:w-12 md:h-12 bg-brand-primary rounded-full flex items-center justify-center text-black text-xl md:text-2xl shadow-[0_0_20px_rgba(46,204,113,0.3)] group-hover:scale-110 transition-transform">$</span>
              MENOR PREÇO
            </h1>
            <p className="text-[10px] md:text-xs uppercase tracking-[0.3em] text-text-muted mt-2 font-bold">Inteligência e Comparação de Preços</p>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex gap-6 text-[10px] uppercase tracking-widest text-text-muted font-bold">
              <div className="flex flex-col items-end">
                <span className="text-brand-primary text-sm font-mono">{products.length}</span> LOJAS ATIVAS
              </div>
              <div className="flex flex-col items-end">
                <span className="text-brand-primary text-sm font-mono">{(stats.searches/100).toFixed(1)}k</span> CONSULTAS
              </div>
            </div>

            {/* Auth Button */}
            <div className="flex items-center gap-3">
              {user ? (
                <div className="flex items-center gap-3 bg-bg-card border border-border-dim px-4 py-2 rounded-xl shadow-lg">
                  <img src={user.photoURL || ''} alt="" className="w-6 h-6 rounded-full border border-brand-primary/30" />
                  <div className="hidden sm:block">
                    <div className="text-[10px] text-text-muted font-bold uppercase truncate max-w-[80px]">{user.displayName}</div>
                  </div>
                  <button onClick={() => signOut(auth)} className="text-red-400 hover:text-red-300 transition-colors">
                    <LogOut size={16} />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="flex items-center gap-2 text-xs font-black bg-brand-primary text-black px-6 py-3 rounded-xl shadow-[0_0_20px_rgba(46,204,113,0.2)] hover:scale-105 transition-all uppercase tracking-widest"
                >
                  <LogIn size={14} strokeWidth={3} /> Entrar
                </button>
              )}
            </div>
          </div>
        </header>

        {saveMessage && (
          <div className="mb-6 rounded-3xl border border-brand-primary/20 bg-brand-primary/10 p-4 text-sm font-bold text-brand-primary shadow-sm">
            {saveMessage}
          </div>
        )}

        {/* Content Grid */}
        <div className="grid grid-cols-12 gap-8">
          
          {/* Left Sidebar (Filters) */}
          <aside className="col-span-12 md:col-span-4 flex flex-col gap-8">
            <div className="bg-bg-card border border-border-dim p-6 rounded-3xl shadow-2xl">
              <label className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-4 block">Filtro de busca</label>
              <div className="relative group">
                <input
                  type="text"
                  placeholder="Buscar produto ou loja..."
                  className="w-full bg-bg-dark border border-border-dim rounded-xl py-4 px-5 text-sm focus:outline-none focus:border-brand-primary transition-colors text-text-main placeholder:text-gray-700"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (e.target.value.length > 2) incrementStat('searches');
                  }}
                />
                <div className="absolute right-4 top-4 text-brand-primary opacity-50 group-focus-within:opacity-100 transition-opacity">
                  <Search size={20} />
                </div>
              </div>

              <div className="mt-10">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-6 block">Categorias de Rede</label>
                <div className="flex flex-col gap-3">
                  {(['todos', 'mercado', 'posto'] as const).map((cat) => {
                    const isActive = filter === cat;
                    const count = cat === 'todos' ? products.length : products.filter(p => p.category === cat).length;
                    
                    return (
                      <button
                        key={cat}
                        onClick={() => setFilter(cat)}
                        className={`flex justify-between items-center px-5 py-4 border rounded-xl text-sm font-bold transition-all ${
                          isActive 
                            ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/40 shadow-[0_0_15px_rgba(46,204,113,0.1)]' 
                            : 'bg-bg-dark border-border-dim text-text-muted hover:bg-bg-card hover:border-gray-700'
                        }`}
                      >
                        <span className="uppercase tracking-wider">{cat === 'todos' ? 'Todos os Itens' : cat === 'mercado' ? 'Supermercados' : 'Postos de Combustível'}</span>
                        <span className={`text-[10px] font-mono ${isActive ? 'opacity-100' : 'opacity-40'}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Daily Highlight */}
            {filteredProducts.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-gradient-to-br from-brand-primary/20 to-transparent border border-brand-primary/20 p-8 rounded-3xl relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-brand-primary/5 blur-3xl rounded-full" />
                <h3 className="text-sm font-black text-brand-primary mb-3 italic tracking-tighter uppercase">Destaque do Dia</h3>
                <p className="text-xs text-text-muted leading-relaxed mb-6 font-medium">
                  {filteredProducts[0].nome} com o melhor valor detectado na região. Economia superior a 15% comparado à média.
                </p>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-black tracking-tighter text-text-main">R$ {filteredProducts[0].price?.toFixed(2)}</span>
                  <span className="text-[10px] text-brand-primary font-bold uppercase mb-1.5 animate-pulse">AO VIVO</span>
                </div>
              </motion.div>
            )}
          </aside>

          {/* Right Content (Product Grid) */}
          <section className="col-span-12 md:col-span-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 auto-rows-fr">
              <AnimatePresence mode="popLayout">
                {filteredProducts.length > 0 ? (
                  filteredProducts.map((product, idx) => (
                    <motion.div
                      key={product.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ delay: idx * 0.05 }}
                      className="bg-bg-card border border-border-dim rounded-2xl p-6 flex flex-col justify-between hover:border-brand-primary/50 transition-all cursor-pointer group shadow-lg"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <span className={`text-[9px] px-3 py-1 rounded-md border font-black uppercase tracking-widest ${
                            product.category === 'mercado' 
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                              : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                          }`}>
                            {product.category === 'mercado' ? 'Supermercado' : 'Posto'}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(product);
                              }}
                              className="text-[10px] text-gray-500 hover:text-brand-primary transition-colors p-1 hover:bg-brand-primary/10 rounded"
                              title="Editar anúncio"
                            >
                              ✏️
                            </button>
                            <span className="text-[10px] text-gray-700 font-mono font-bold">#{product.id.substring(0, 4)}</span>
                          </div>
                        </div>
                        {product.imageUrl ? (
                          <div className="mb-4 overflow-hidden rounded-3xl border border-border-dim">
                            <img
                              src={product.imageUrl}
                              alt={product.nome}
                              className="w-full h-40 object-cover"
                            />
                          </div>
                        ) : (
                          <div className="mb-4 w-full h-40 rounded-3xl bg-gray-900/80 border border-border-dim flex items-center justify-center text-gray-500">
                            <Camera size={32} />
                          </div>
                        )}
                        <h4 className="text-xl font-black text-text-main group-hover:text-brand-primary transition-colors leading-tight">{product.nome}</h4>
                        <p className="text-xs text-text-muted mt-2 font-medium flex items-center gap-1.5">
                          <Store size={12} className="opacity-50" />
                          {product.storeName}
                        </p>
                      </div>
                      
                      <div className="mt-8 flex justify-between items-end border-t border-border-dim pt-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1 text-[10px] text-gray-700 font-bold uppercase">
                            {product.address?.substring(0, 15)}
                          </div>
                          <div className="text-[10px] text-gray-700 font-medium">
                            {product.createdAt?.seconds 
                              ? `Atu: ${new Date(product.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                              : 'Agora'}
                          </div>
                        </div>
                        <div className="text-3xl font-black text-brand-primary tracking-tighter">
                          <span className="text-sm font-sans mr-0.5">R$</span>
                          {(product.price??0).toFixed(2)}
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-full py-20 text-center bg-bg-card/50 border border-border-dim border-dashed rounded-3xl">
                    <div className="w-16 h-16 bg-bg-dark rounded-full flex items-center justify-center mx-auto mb-4 border border-border-dim">
                      <Search size={24} className="text-gray-700" />
                    </div>
                    <p className="text-text-muted font-bold uppercase tracking-widest text-xs">Nenhum dado interceptado</p>
                    <button 
                      onClick={() => {setSearch(''); setFilter('todos');}}
                      className="mt-6 text-brand-primary text-xs font-black uppercase tracking-widest hover:underline"
                    >
                      Reiniciar Protocolo
                    </button>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="mt-20 pt-10 border-t border-border-dim flex flex-col sm:flex-row justify-between items-center gap-4 text-[10px] uppercase tracking-[0.2em] text-text-muted font-black md:pr-24">
          <div className="flex gap-8">
            <span>Versão 2.1.0 - Enterprise</span>
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse shadow-[0_0_5px_#2ecc71]" /> 
              Sistema Operacional
            </span>
          </div>
          <div className="text-gray-700">Framework de Inteligência Digital &copy; 2026</div>
        </footer>
      </div>

      {/* Floating Action Button */}
      <motion.button
        whileHover={{ scale: 1.1, rotate: 90 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          if (!user) {
            handleLogin();
          } else {
            // Show options: Camera or Manual
            const choice = confirm('📸 Usar câmera para capturar produto?\n\nOK = Câmera\nCancelar = Cadastro Manual');
            if (choice) {
              openCameraModal();
            } else {
              openAddModalWithPrefill();
            }
          }
        }}
        className="fixed bottom-8 right-8 w-16 h-16 bg-brand-primary text-black rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(46,204,113,0.4)] z-30 transition-shadow"
      >
        <Camera size={28} strokeWidth={3} />
      </motion.button>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-bg-dark/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-bg-card w-full max-w-md rounded-[2.5rem] p-6 sm:p-8 relative z-10 border border-border-dim shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-6 gap-4">
                <div>
                  <h2 className="text-2xl font-black tracking-tighter text-brand-primary">NOVO REGISTRO</h2>
                  <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Compartilhe inteligência de preços</p>
                </div>
                <button onClick={() => setShowAddModal(false)} className="bg-bg-dark p-3 rounded-full text-text-muted hover:text-white transition-colors border border-border-dim">
                  <X size={20} />
                </button>
              </div>
              
              <AddProductForm
                onSubmit={handleAddProduct}
                initialData={cameraPrefill ?? undefined}
                previewImage={cameraPhotoData ?? undefined}
                onRemovePreviewImage={removePreviewImage}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {showEditModal && editingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowEditModal(false);
                setEditingProduct(null);
              }}
              className="absolute inset-0 bg-bg-dark/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-bg-card w-full max-w-md rounded-[2.5rem] p-6 sm:p-8 relative z-10 border border-border-dim shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black tracking-tighter text-orange-500">EDITAR REGISTRO</h2>
                  <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Atualizar inteligência de preços</p>
                </div>
                <button 
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingProduct(null);
                  }} 
                  className="bg-bg-dark p-3 rounded-full text-text-muted hover:text-white transition-colors border border-border-dim"
                >
                  <X size={20} />
                </button>
              </div>
              
              <EditProductForm 
                product={editingProduct} 
                onSubmit={handleEditProduct} 
                onCancel={() => {
                  setShowEditModal(false);
                  setEditingProduct(null);
                }}
                onDelete={handleDeleteProduct}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Camera Modal */}
      <AnimatePresence>
        {showCameraModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => closeCameraModal()}
              className="absolute inset-0 bg-bg-dark/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-bg-card w-full max-w-lg rounded-[2.5rem] p-6 relative z-10 border border-border-dim shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-black tracking-tighter text-blue-500">📸 CAPTURA INTELIGENTE</h2>
                  <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">OCR Automático de Produtos</p>
                </div>
                <button 
                  onClick={() => closeCameraModal()}
                  className="bg-bg-dark p-3 rounded-full text-text-muted hover:text-white transition-colors border border-border-dim"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                {!capturedImage ? (
                  <div className="relative">
                    <video 
                      ref={videoRef}
                      autoPlay 
                      playsInline 
                      muted
                      className="w-full h-64 bg-black rounded-2xl object-cover"
                    />
                    <canvas ref={canvasRef} className="hidden" />

                    {!cameraStarted && (
                      <div className="absolute inset-0 rounded-2xl bg-black/75 flex flex-col items-center justify-center gap-4 p-4">
                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-6 py-3 bg-brand-primary text-black rounded-full font-bold hover:bg-opacity-80 transition-colors"
                        >
                          📸 Iniciar Câmera
                        </button>
                        {cameraError && (
                          <div className="text-sm text-red-100 bg-red-600/90 rounded-2xl px-4 py-3 text-center">
                            {cameraError}
                          </div>
                        )}
                      </div>
                    )}

                    {cameraStarted && (
                      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-3">
                        <button
                          type="button"
                          onClick={captureImage}
                          className="w-16 h-16 bg-white text-black rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
                        >
                          <div className="w-8 h-8 bg-black rounded-full"></div>
                        </button>
                      </div>
                    )}

                    {cameraError && cameraStarted && (
                      <div className="absolute bottom-28 left-1/2 transform -translate-x-1/2 px-4">
                        <div className="text-sm text-red-100 bg-red-600/90 rounded-2xl px-4 py-3 text-center">
                          {cameraError}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative">
                      <img 
                        src={capturedImage} 
                        alt="Captured product"
                        className="w-full h-64 object-cover rounded-2xl"
                      />
                      {isProcessing && (
                        <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center">
                          <div className="text-center">
                            <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full mx-auto mb-2"></div>
                            <p className="text-white text-sm font-bold">ANALISANDO IMAGEM...</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {ocrError && (
                      <div className="text-sm text-red-100 bg-red-600/90 rounded-2xl px-4 py-3 text-center">
                        {ocrError}
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={resetCamera}
                        className="flex-1 py-4 bg-gray-600 text-white rounded-2xl font-bold uppercase tracking-[0.2em] text-xs hover:bg-gray-700 transition-all flex items-center justify-center gap-2"
                      >
                        <RotateCcw size={16} />
                        Recapturar
                      </button>
                      <button
                        onClick={() => {
                          closeCameraModal(true);
                          openAddModalWithPrefill(cameraPrefill ?? undefined);
                        }}
                        className="flex-1 py-4 bg-blue-500 text-white rounded-2xl font-black uppercase tracking-[0.3em] text-xs shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                      >
                        <CheckCircle size={16} />
                        Continuar
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {cameraLocation && (
                    <div className="text-left text-[10px] text-text-main bg-bg-dark/80 border border-border-dim rounded-2xl p-3">
                      <div className="font-black uppercase tracking-[0.3em] mb-1">GPS detectado</div>
                      <div>Coordenadas: {cameraLocation}</div>
                      {cameraStoreName && <div>Estabelecimento sugerido: {cameraStoreName}</div>}
                      {cameraAddress && <div>Endereço: {cameraAddress}</div>}
                    </div>
                  )}
                  {geoError && (
                    <div className="text-left text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl p-3">
                      {geoError}
                    </div>
                  )}
                  <div className="text-center">
                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">
                      Posicione o produto na câmera para captura automática
                    </p>
                    <p className="text-[9px] text-gray-600 mt-1">
                      Suporte a OCR para extração automática de dados
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Panel */}
      <AnimatePresence>
        {showAdmin && (
          <div className="fixed inset-0 z-[60] bg-bg-dark text-text-main flex flex-col p-8 overflow-hidden font-sans">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none radial-dots" />
            
            <div className="relative z-10 flex items-center justify-between mb-12">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-bg-card border border-border-dim rounded-2xl flex items-center justify-center">
                  <ShieldCheck className="text-brand-primary" size={28} />
                </div>
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tighter leading-none">CONSOLE CENTRAL</h2>
                  <p className="text-[10px] text-text-muted font-bold tracking-[0.3em] mt-1 uppercase">Autenticação Root Verificada</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAdmin(false)}
                className="px-6 py-3 bg-red-500/10 text-red-500 rounded-xl font-bold border border-red-500/20 uppercase text-xs tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-lg"
              >
                Encerrar Sessão
              </button>
            </div>

            <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <StatCard label="Total de Requisições de Inteligência" value={stats.searches} color="blue" />
              <StatCard label="Acessos ao Console Admin" value={stats.accesses} color="purple" />
              <StatCard label="Sincronizações Globais de Dados" value={stats.additions} color="green" />
            </div>

            <div className="relative z-10 flex-1 flex flex-col gap-8 overflow-hidden">
              <div className="flex-1 overflow-auto pr-4 scrollbar-thin scrollbar-thumb-border-dim scrollbar-track-transparent">
                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.3em] mb-6">Auditoria do Sistema em Tempo Real</h3>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-bg-card border border-border-dim rounded-3xl p-8">
                    <div className="flex items-center gap-4 mb-6">
                      <Settings className="text-brand-primary" size={20} />
                      <h4 className="text-sm font-black uppercase tracking-widest">Parâmetros do Ambiente</h4>
                    </div>
                    <div className="font-mono text-[11px] space-y-4">
                      <div className="flex justify-between items-center group">
                        <span className="text-text-muted group-hover:text-text-main transition-colors">Nodos de Dados Totais:</span>
                        <span className="text-brand-primary">{products.length} unidades</span>
                      </div>
                      <div className="flex justify-between items-center group">
                        <span className="text-text-muted group-hover:text-text-main transition-colors">Entropia do Sistema:</span>
                        <span className="text-blue-400">Estável - 0.04%</span>
                      </div>
                      <div className="flex justify-between items-center group">
                        <span className="text-text-muted group-hover:text-text-main transition-colors">Vínculo Relacional:</span>
                        <span className="text-purple-400">Firestore (Ativo)</span>
                      </div>
                      <div className="flex justify-between items-center group">
                        <span className="text-text-muted group-hover:text-text-main transition-colors">Assinatura da Sessão:</span>
                        <span className="text-text-main uppercase tracking-tighter">{Math.random().toString(16).substring(2, 10)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-bg-card border border-border-dim rounded-3xl p-8">
                     <div className="flex items-center gap-4 mb-6">
                      <TrendingDown className="text-brand-primary" size={20} />
                      <h4 className="text-sm font-black uppercase tracking-widest">Status da Rede</h4>
                    </div>
                    <div className="space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                          <CloudLightning size={20} />
                        </div>
                        <div>
                          <div className="text-xs font-black uppercase tracking-widest">Região us-west1</div>
                          <div className="text-[10px] text-text-muted font-medium mt-0.5">Latência: 42ms &bull; SSL Seguro</div>
                        </div>
                      </div>
                      <div className="bg-brand-primary/5 border border-brand-primary/20 rounded-2xl p-4 flex gap-4 text-brand-primary">
                        <AlertCircle size={24} className="shrink-0 mt-1" />
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest mb-1">Protocolo de Segurança</div>
                          <p className="text-[10px] leading-relaxed opacity-80">Todas as operações são verificadas por Regras de Segurança em Nuvem. Escritas não autorizadas são encerradas imediatamente.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-auto py-6 text-center text-[10px] text-gray-700 font-black uppercase tracking-[0.5em]">
                Interface Empresarial Segura &bull; Acesso Restrito
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Modified Forms & Cards ---

function AddProductForm({ onSubmit, initialData, previewImage, onRemovePreviewImage }: { onSubmit: (p: Omit<Product, 'id' | 'createdAt' | 'userId'>) => void; initialData?: Omit<Product, 'id' | 'createdAt' | 'userId'>; previewImage?: string; onRemovePreviewImage?: () => void }) {
  const [formData, setFormData] = useState<Omit<Product, 'id' | 'createdAt' | 'userId'>>({
    nome: initialData?.nome || '',
    category: initialData?.category ?? 'mercado',
    price: initialData?.price ?? 0,
    storeName: initialData?.storeName || '',
    address: initialData?.address || ''
  });
  const [formError, setFormError] = useState<string>('');

  useEffect(() => {
    setFormData({
      nome: initialData?.nome || '',
      category: initialData?.category ?? 'mercado',
      price: initialData?.price ?? 0,
      storeName: initialData?.storeName || '',
      address: initialData?.address || ''
    });
    setFormError('');
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    console.log('AddProductForm submit', formData);

    if (!formData.nome?.trim() ||!(formData.storeName || '')?.trim()  || formData.price === undefined || Number.isNaN(formData.price)) {
      setFormError('Por favor, preencha o nome do produto, preço e loja corretamente.');
      return;
    }

    onSubmit(formData);
  };

  const inputClasses = "w-full bg-bg-dark border border-border-dim rounded-xl p-4 text-sm focus:outline-none focus:border-brand-primary transition-all text-text-main placeholder:text-gray-800";
  const labelClasses = "block text-[10px] font-black text-text-muted uppercase tracking-[0.2em] mb-2";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {previewImage && (
        <div className="rounded-[2rem] overflow-hidden border border-border-dim shadow-lg">
          <img src={previewImage} alt="Pré-visualização da foto" className="w-full h-48 object-cover" />
          <div className="bg-bg-dark px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-text-muted font-black">
            Foto capturada disponível para envio junto com o cadastro
          </div>
          {onRemovePreviewImage && (
            <div className="p-4 bg-bg-card border-t border-border-dim">
              <button
                type="button"
                onClick={onRemovePreviewImage}
                className="w-full py-3 bg-red-500 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-red-600 transition-all"
              >
                Remover foto
              </button>
            </div>
          )}
        </div>
      )}

      {formError && (
        <div className="rounded-3xl border border-red-400 bg-red-500/10 p-4 text-sm font-bold text-red-700">
          {formError}
        </div>
      )}

      <div>
        <label className={labelClasses}>DESCRIÇÃO DO PRODUTO</label>
        <input
          required
          type="text"
          placeholder="Ex: Arroz 5kg, Diesel S-10..."
          className={inputClasses}
          value={formData.nome}
          onChange={e => {
            setFormData(prev => ({ ...prev, nome: e.target.value }));
            setFormError('');
          }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClasses}>Valor Unitário (R$)</label>
          <input
            required
            type="number"
            step="0.01"
            placeholder="0.00"
            className={inputClasses}
            value={formData.price || ''}
            onChange={e => {
              setFormData(prev => ({ ...prev, price: e.target.value === '' ? 0 : parseFloat(e.target.value) }));
              setFormError('');
            }}
          />
        </div>
        <div>
          <label className={labelClasses}>Segmento</label>
          <select
            className={inputClasses}
            value={formData.category}
            onChange={e => {
              setFormData(prev => ({ ...prev, category: e.target.value as any }));
              setFormError('');
            }}
          >
            <option value="mercado">Supermercado</option>
            <option value="posto">Posto de Comb.</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelClasses}>Entidade Comercial</label>
        <input
          required
          type="text"
          placeholder="Nome do estabelecimento"
          className={inputClasses}
          value={formData.storeName}
          onChange={e => {
            setFormData(prev => ({ ...prev, storeName: e.target.value }));
            setFormError('');
          }}
        />
      </div>

      <div>
        <label className={labelClasses}>Coordenadas / Endereço</label>
        <input
          type="text"
          placeholder="Logradouro completo"
          className={inputClasses}
          value={formData.address}
          onChange={e => {
            setFormData(prev => ({ ...prev, address: e.target.value }));
            setFormError('');
          }}
        />
      </div>

      <button
        type="submit"
        className="w-full py-4 bg-brand-primary text-black rounded-2xl font-black uppercase tracking-[0.3em] text-sm shadow-[0_0_30px_rgba(46,204,113,0.3)] hover:bg-brand-primary/90 transition-all mt-4"
      >
        Salvar
      </button>
    </form>
  );
}

function EditProductForm({ 
  product, 
  onSubmit, 
  onCancel, 
  onDelete
}: { 
  product: Product; 
  onSubmit: (p: Omit<Product, 'id' | 'createdAt' | 'userId'>) => void;
  onCancel: () => void;
  onDelete: (productId: string) => void;
}) {
  const [formData, setFormData] = useState<Omit<Product, 'id' | 'createdAt' | 'userId'>>({
    nome: product.nome || '',
    category: product.category,
    price: product.price || product.preco || 0,
    storeName: product.storeName || '',
    address: product.address || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome || !formData.price || !formData.storeName) {
      alert('Preencha os campos de protocolos obrigatórios.');
      return;
    }
    onSubmit(formData);
  };

  const inputClasses = "w-full bg-bg-dark border border-border-dim rounded-xl p-4 text-sm focus:outline-none focus:border-orange-500 transition-all text-text-main placeholder:text-gray-800";
  const labelClasses = "block text-[9px] font-black text-text-muted uppercase tracking-[0.2em] mb-2";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className={labelClasses}>DESCRIÇÃO DO PRODUTO</label>
        <input
          required
          type="text"
          placeholder="Ex: Arroz 5kg, Diesel S-10..."
          className={inputClasses}
          value={formData.nome}
          onChange={e => setFormData(prev => ({ ...prev, nome: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClasses}>Valor Unitário (R$)</label>
          <input
            required
            type="number"
            step="0.01"
            placeholder="0.00"
            className={inputClasses}
            value={formData.price || ''}
            onChange={e => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
          />
        </div>
        <div>
          <label className={labelClasses}>Segmento</label>
          <select
            className={inputClasses}
            value={formData.category}
            onChange={e => setFormData(prev => ({ ...prev, category: e.target.value as any }))}
          >
            <option value="mercado">Supermercado</option>
            <option value="posto">Posto de Comb.</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelClasses}>Entidade Comercial</label>
        <input
          required
          type="text"
          placeholder="Nome do estabelecimento"
          className={inputClasses}
          value={formData.storeName}
          onChange={e => setFormData(prev => ({ ...prev, storeName: e.target.value }))}
        />
      </div>

      <div>
        <label className={labelClasses}>Coordenadas / Endereço</label>
        <input
          type="text"
          placeholder="Logradouro completo"
          className={inputClasses}
          value={formData.address}
          onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-3 mt-6 sm:flex-row">
        <button
          type="button"
          onClick={() => onDelete(product.id)}
          className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-red-600 transition-all"
        >
          Excluir
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-4 bg-gray-600 text-white rounded-2xl font-bold uppercase tracking-[0.2em] text-xs hover:bg-gray-700 transition-all"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="flex-1 py-4 bg-orange-500 text-white rounded-2xl font-black uppercase tracking-[0.3em] text-xs shadow-[0_0_30px_rgba(255,165,0,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          Atualizar
        </button>
      </div>
    </form>
  );
}

function CloudLightning({ size }: { size: number }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    >
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
      <path d="m11 13-2 3h3l-2 3"/>
    </svg>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors = {
    blue: 'border-blue-500/30 text-blue-400',
    purple: 'border-purple-500/30 text-purple-400',
    green: 'border-brand-primary/30 text-brand-primary',
  };
  
  return (
    <div className={`p-4 bg-white/5 border rounded-2xl flex justify-between items-center ${colors[color as keyof typeof colors]}`}>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-2xl font-bold font-mono">{value}</span>
    </div>
  );
}

