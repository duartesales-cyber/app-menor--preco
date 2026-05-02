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
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  doc, 
  setDoc, 
  getDoc, 
  serverTimestamp, 
  query, 
  orderBy,
  increment,
  updateDoc,where
} from 'firebase/firestore';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { db, auth, signInWithGoogle } from './lib/firebase';
import { handleFirestoreError, OperationType } from './lib/firestore-errors';

// --- Types ---.
interface Product {
  id: string;
  nome: string;
  preco: number;
  category: 'mercado' | 'posto';
  storeName?: string;
  address?: string;
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
  const [stats, setStats] = useState<Stats>({ searches: 0, accesses: 0, additions: 0 });
  const [tapCount, setTapCount] = useState(0);
  const tapTimer = useRef<NodeJS.Timeout | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
  }, []);

  // Products Listener
  useEffect(() => {
const q = query(collection(db, 'produtos'), where('uid', '==', user?.uid));
  const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id, 
        ...doc.data() 
      } as Product));
      setProducts(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });
    return unsubscribe;
  }, []);

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
      .filter(p => {
  const matchesSearch = p.nome.toLowerCase().includes(search.toLowerCase()) || 
                             (p.storeName?.toLowerCase().includes(search.toLowerCase()) ?? false);
        const matchesFilter = filter === 'todos' || p.category === filter;
      })
      .sort((a, b) => a.preco - b.preco);
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
    setTapCount(prev => prev + 1);
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

    try {
      await addDoc(collection(db, 'products'), {
        ...newProduct,
        userId: user.uid,
        createdAt: serverTimestamp(),
      });
      incrementStat('additions');
      setShowAddModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'products');
    }
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
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
                  {filteredProducts[0].item} com o melhor valor detectado na região. Economia superior a 15% comparado à média.
                </p>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-black tracking-tighter text-text-main">R$ {filteredProducts[0].price.toFixed(2)}</span>
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
                          <span className="text-[10px] text-gray-700 font-mono font-bold">#{product.id.substring(0, 4)}</span>
                        </div>
                        <h4 className="text-xl font-black text-text-main group-hover:text-brand-primary transition-colors leading-tight">{product.item}</h4>
                        <p className="text-xs text-text-muted mt-2 font-medium flex items-center gap-1.5">
                          <Store size={12} className="opacity-50" />
                          {product.storeName}
                        </p>
                      </div>
                      
                      <div className="mt-8 flex justify-between items-end border-t border-border-dim pt-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1 text-[10px] text-gray-700 font-bold uppercase">
                            <MapPin size={10} /> {product.address.substring(0, 15)}...
                          </div>
                          <div className="text-[10px] text-gray-700 font-medium">
                            {product.createdAt?.seconds 
                              ? `Atu: ${new Date(product.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                              : 'Agora'}
                          </div>
                        </div>
                        <div className="text-3xl font-black text-brand-primary tracking-tighter">
                          <span className="text-sm font-sans mr-0.5">R$</span>
                          {product.price.toFixed(2)}
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
            setShowAddModal(true);
          }
        }}
        className="fixed bottom-8 right-8 w-16 h-16 bg-brand-primary text-black rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(46,204,113,0.4)] z-30 transition-shadow"
      >
        <Plus size={32} strokeWidth={3} />
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
              className="bg-bg-card w-full max-w-md rounded-[2.5rem] p-8 relative z-10 border border-border-dim shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black tracking-tighter text-brand-primary">NOVO REGISTRO</h2>
                  <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Compartilhe inteligência de preços</p>
                </div>
                <button onClick={() => setShowAddModal(false)} className="bg-bg-dark p-3 rounded-full text-text-muted hover:text-white transition-colors border border-border-dim">
                  <X size={20} />
                </button>
              </div>
              
              <AddProductForm onSubmit={handleAddProduct} />
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

function AddProductForm({ onSubmit }: { onSubmit: (p: Omit<Product, 'id' | 'createdAt' | 'userId'>) => void }) {
  const [formData, setFormData] = useState<Omit<Product, 'id' | 'createdAt' | 'userId'>>({
    item: '',
    category: 'mercado',
    price: 0,
    storeName: '',
    address: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.item || !formData.price || !formData.storeName) {
      alert('Preencha os campos de protocolos obrigatórios.');
      return;
    }
    onSubmit(formData);
  };

  const inputClasses = "w-full bg-bg-dark border border-border-dim rounded-xl p-4 text-sm focus:outline-none focus:border-brand-primary transition-all text-text-main placeholder:text-gray-800";
  const labelClasses = "block text-[9px] font-black text-text-muted uppercase tracking-[0.2em] mb-2";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className={labelClasses}>Descriptor do Produto</label>
        <input
          required
          type="text"
          placeholder="Ex: Arroz 5kg, Diesel S-10..."
          className={inputClasses}
          value={formData.item}
          onChange={e => setFormData(prev => ({ ...prev, item: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
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

      <button
        type="submit"
        className="w-full py-5 bg-brand-primary text-black rounded-2xl font-black uppercase tracking-[0.3em] text-xs shadow-[0_0_30px_rgba(46,204,113,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all mt-4"
      >
        Executar Cadastro
      </button>
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

