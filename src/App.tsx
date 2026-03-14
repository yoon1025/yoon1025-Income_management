import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  TrendingUp, 
  Calendar, 
  CheckCircle2, 
  Circle, 
  MoreVertical, 
  Trash2, 
  LogOut, 
  LogIn,
  PieChart as PieChartIcon,
  BarChart3,
  ChevronRight,
  ChevronLeft,
  Filter,
  Download
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  Timestamp,
  orderBy,
  getDocFromServer
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths, isSameMonth, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { db, auth } from './firebase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
interface IncomeEntry {
  id: string;
  client: string;
  amount: number;
  date: Timestamp;
  status: 'pending' | 'paid';
  memo: string;
  userId: string;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'paid'>('all');
  
  // Form State
  const [newIncome, setNewIncome] = useState({
    client: '',
    amount: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    status: 'pending' as 'pending' | 'paid',
    memo: ''
  });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Connection Test
  useEffect(() => {
    if (user) {
      const testConnection = async () => {
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (error) {
          if (error instanceof Error && error.message.includes('the client is offline')) {
            console.error("Please check your Firebase configuration.");
          }
        }
      };
      testConnection();
    }
  }, [user]);

  // Firestore Error Handler
  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    // In a real app, you might show a toast here
  };

  // Data Listener
  useEffect(() => {
    if (!user) {
      setIncomes([]);
      return;
    }

    const q = query(
      collection(db, 'incomes'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries: IncomeEntry[] = [];
      snapshot.forEach((doc) => {
        entries.push({ id: doc.id, ...doc.data() } as IncomeEntry);
      });
      setIncomes(entries);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'incomes');
    });

    return () => unsubscribe();
  }, [user]);

  // Auth Actions
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  // Income Actions
  const handleAddIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await addDoc(collection(db, 'incomes'), {
        client: newIncome.client,
        amount: Number(newIncome.amount),
        date: Timestamp.fromDate(new Date(newIncome.date)),
        status: newIncome.status,
        memo: newIncome.memo,
        userId: user.uid
      });
      setIsModalOpen(false);
      setNewIncome({
        client: '',
        amount: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        status: 'pending',
        memo: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'incomes');
    }
  };

  const toggleStatus = async (income: IncomeEntry) => {
    try {
      await updateDoc(doc(db, 'incomes', income.id), {
        status: income.status === 'paid' ? 'pending' : 'paid'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `incomes/${income.id}`);
    }
  };

  const deleteIncome = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'incomes', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `incomes/${id}`);
    }
  };

  // Statistics Calculation
  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = incomes.filter(inc => isSameMonth(inc.date.toDate(), now));
    const totalCurrentMonth = currentMonth.reduce((sum, inc) => sum + inc.amount, 0);
    const paidCurrentMonth = currentMonth.filter(inc => inc.status === 'paid').reduce((sum, inc) => sum + inc.amount, 0);
    const pendingCurrentMonth = totalCurrentMonth - paidCurrentMonth;

    // Monthly data for chart (last 6 months)
    const monthlyData = Array.from({ length: 6 }).map((_, i) => {
      const d = subMonths(now, 5 - i);
      const monthIncomes = incomes.filter(inc => isSameMonth(inc.date.toDate(), d));
      return {
        name: format(d, 'MMM', { locale: ko }),
        total: monthIncomes.reduce((sum, inc) => sum + inc.amount, 0),
        paid: monthIncomes.filter(inc => inc.status === 'paid').reduce((sum, inc) => sum + inc.amount, 0),
      };
    });

    return {
      totalCurrentMonth,
      paidCurrentMonth,
      pendingCurrentMonth,
      monthlyData
    };
  }, [incomes]);

  const filteredIncomes = incomes.filter(inc => {
    const matchesSearch = inc.client.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         inc.memo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || inc.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-100">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
            <TrendingUp className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Freelance Income</h1>
          <p className="text-slate-500 mb-8">프리랜서를 위한 스마트한 수입 관리 솔루션</p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
          >
            <LogIn className="w-5 h-5" />
            Google 계정으로 시작하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-blue-100">
              <TrendingUp className="text-white w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-800">IncomeTracker</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-medium text-slate-700">{user.displayName}</span>
              <span className="text-xs text-slate-400">{user.email}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
              title="로그아웃"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">이번 달 총 수입</span>
              <div className="p-2 bg-blue-50 rounded-lg">
                <BarChart3 className="text-blue-600 w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900">
              ₩{stats.totalCurrentMonth.toLocaleString()}
            </div>
            <div className="mt-2 text-sm text-slate-400">
              {format(new Date(), 'yyyy년 M월')} 기준
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">입금 완료</span>
              <div className="p-2 bg-emerald-50 rounded-lg">
                <CheckCircle2 className="text-emerald-600 w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-bold text-emerald-600">
              ₩{stats.paidCurrentMonth.toLocaleString()}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-500" 
                  style={{ width: `${(stats.paidCurrentMonth / (stats.totalCurrentMonth || 1)) * 100}%` }}
                />
              </div>
              <span className="text-xs font-medium text-slate-500">
                {Math.round((stats.paidCurrentMonth / (stats.totalCurrentMonth || 1)) * 100)}%
              </span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">미입금 (대기)</span>
              <div className="p-2 bg-amber-50 rounded-lg">
                <Circle className="text-amber-600 w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-bold text-amber-600">
              ₩{stats.pendingCurrentMonth.toLocaleString()}
            </div>
            <div className="mt-2 text-sm text-slate-400">
              {incomes.filter(inc => inc.status === 'pending').length}건의 대기 항목
            </div>
          </div>
        </div>

        {/* Charts & Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Chart Section */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-800">수입 추이 (최근 6개월)</h2>
              <div className="flex gap-2">
                <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-md">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    tickFormatter={(value) => `₩${(value / 10000).toLocaleString()}만`}
                  />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [`₩${value.toLocaleString()}`, '수입']}
                  />
                  <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={32} />
                  <Bar dataKey="paid" fill="#10b981" radius={[4, 4, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick Actions & Filter */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold text-slate-800 mb-6">필터 및 검색</h2>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                  type="text" 
                  placeholder="거래처 또는 메모 검색..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-400 uppercase">입금 상태</label>
                <div className="flex p-1 bg-slate-50 rounded-xl border border-slate-200">
                  <button 
                    onClick={() => setFilterStatus('all')}
                    className={cn(
                      "flex-1 py-1.5 text-sm font-medium rounded-lg transition-all",
                      filterStatus === 'all' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    전체
                  </button>
                  <button 
                    onClick={() => setFilterStatus('pending')}
                    className={cn(
                      "flex-1 py-1.5 text-sm font-medium rounded-lg transition-all",
                      filterStatus === 'pending' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    대기
                  </button>
                  <button 
                    onClick={() => setFilterStatus('paid')}
                    className={cn(
                      "flex-1 py-1.5 text-sm font-medium rounded-lg transition-all",
                      filterStatus === 'paid' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    완료
                  </button>
                </div>
              </div>

              <button 
                onClick={() => setIsModalOpen(true)}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
              >
                <Plus className="w-5 h-5" />
                새 수입 내역 추가
              </button>
            </div>
          </div>
        </div>

        {/* Income List */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="text-lg font-bold text-slate-800">최근 내역</h2>
            <span className="text-sm text-slate-500">{filteredIncomes.length}개의 항목</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-6 py-4">상태</th>
                  <th className="px-6 py-4">날짜</th>
                  <th className="px-6 py-4">거래처</th>
                  <th className="px-6 py-4 text-right">금액</th>
                  <th className="px-6 py-4">메모</th>
                  <th className="px-6 py-4 text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredIncomes.length > 0 ? (
                  filteredIncomes.map((income) => (
                    <tr key={income.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <button 
                          onClick={() => toggleStatus(income)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold transition-all",
                            income.status === 'paid' 
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                              : "bg-amber-50 text-amber-600 border border-amber-100"
                          )}
                        >
                          {income.status === 'paid' ? (
                            <><CheckCircle2 className="w-3.5 h-3.5" /> 입금완료</>
                          ) : (
                            <><Circle className="w-3.5 h-3.5" /> 입금대기</>
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {format(income.date.toDate(), 'yyyy. MM. dd')}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-800">
                        {income.client}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">
                        ₩{income.amount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate">
                        {income.memo || '-'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => deleteIncome(income.id)}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center text-slate-400">
                      내역이 없습니다. 새로운 수입을 추가해보세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Add Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-xl font-bold text-slate-800">새 수입 내역 추가</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleAddIncome} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">거래처명</label>
                <input 
                  required
                  type="text" 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="예: 구글 코리아"
                  value={newIncome.client}
                  onChange={(e) => setNewIncome({...newIncome, client: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">금액 (₩)</label>
                  <input 
                    required
                    type="number" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="0"
                    value={newIncome.amount}
                    onChange={(e) => setNewIncome({...newIncome, amount: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">날짜</label>
                  <input 
                    required
                    type="date" 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={newIncome.date}
                    onChange={(e) => setNewIncome({...newIncome, date: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">입금 상태</label>
                <select 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none"
                  value={newIncome.status}
                  onChange={(e) => setNewIncome({...newIncome, status: e.target.value as 'pending' | 'paid'})}
                >
                  <option value="pending">입금 대기</option>
                  <option value="paid">입금 완료</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">메모 (선택)</label>
                <textarea 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                  rows={3}
                  placeholder="추가 정보를 입력하세요..."
                  value={newIncome.memo}
                  onChange={(e) => setNewIncome({...newIncome, memo: e.target.value})}
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 px-4 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all"
                >
                  취소
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 px-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                >
                  저장하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
