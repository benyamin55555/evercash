import { useState, useCallback, useEffect, useRef } from "react";
import { Upload, FileText, DollarSign, CheckCircle, AlertCircle, Download, Trash2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
// import { useDropzone } from "react-dropzone"; // Temporarily disabled
import { nanonetsAPI, ParsedTransaction } from "@/lib/nanonets-api";
import { splitPdfIfNeeded } from "@/lib/pdfco-api";
import { DemoCSVParser } from "@/lib/demo-parser";
import { useApi } from "@/contexts/HybridApiContext";
import { useSimpleCurrency } from '@/contexts/SimpleCurrencyContext';
import { setupAIWithKey } from '@/lib/setup-ai';
import { aiCategorizer } from '@/lib/ai-categorizer';
import '@/lib/console-test'; // Makes window.testAI() available
import { toast } from "sonner";
import { ImportHistory, createImportRecord } from "@/components/ImportHistory";
import { SavedFiles } from "@/components/SavedFiles";
import { isDemoOverlayEnabled, setDemoOverlayEnabled } from "@/lib/demo-overlay";

interface ImportStats {
  totalTransactions: number;
  totalAmount: number;
  incomeCount: number;
  expenseCount: number;
  incomeAmount: number;
  expenseAmount: number;
}

export default function Import() {
  const { api } = useApi();
  const { formatAmount } = useSimpleCurrency();
  
  // Format amounts using the currency context
  const formatAmountFromCents = (amountInDollars: number): string => {
    return formatAmount(amountInDollars);
  };

  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [validTransactions, setValidTransactions] = useState<ParsedTransaction[]>([]);
  const [invalidTransactions, setInvalidTransactions] = useState<Array<{ transaction: ParsedTransaction; errors: string[] }>>([]);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [demoMode, setDemoMode] = useState(false); // Disable demo mode - use real Nanonets API
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [nanonetsResponse, setNanonetsResponse] = useState<any>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [savedToSupabase, setSavedToSupabase] = useState(false);
  // Processing UX
  const [processingTotalParts, setProcessingTotalParts] = useState<number | null>(null);
  const [processingCurrentPart, setProcessingCurrentPart] = useState<number>(0);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [funTip, setFunTip] = useState<string>('');
  const [isCatRunning, setIsCatRunning] = useState(false);
  const [catProcessed, setCatProcessed] = useState(0);
  const [catTotal, setCatTotal] = useState(0);
  const [catUpdated, setCatUpdated] = useState(0);
  const stopRef = useRef(false);

  // Load accounts on component mount
  useEffect(() => {
    if (api) {
      loadAccounts();
    }
  }, [api]);

  // Rotate entertaining tips while processing
  useEffect(() => {
    if (!isProcessing) return;
    const tips = [
      'Pro tip: You can rename accounts from the Accounts page.',
      'Did you know? You can categorize automatically with AI.',
      'Fun fact: Splitting big PDFs improves extraction quality.',
      'Hint: Use rules to auto-categorize frequent merchants.',
      'FYI: You can export reports from the Reports page.',
    ];
    let i = 0;
    setFunTip(tips[i]);
    const id = setInterval(() => {
      i = (i + 1) % tips.length;
      setFunTip(tips[i]);
    }, 2500);
    return () => clearInterval(id);
  }, [isProcessing]);

  const loadAccounts = async () => {
    try {
      const accountsData = await api.getAccounts();
      // If no accounts exist, auto-provision a default for imports
      if (!accountsData || accountsData.length === 0) {
        try {
          const createdId = await api.createAccount({
            name: 'Imported Transactions',
            type: 'checking',
            balance: 0,
            closed: false,
          });
          const refreshed = await api.getAccounts();
          setAccounts(refreshed);
          setSelectedAccount(createdId);
          toast.success('Created default account: Imported Transactions');
          return;
        } catch (e) {
          console.error('Failed to auto-create default account:', e);
        }
      } else {
        setAccounts(accountsData);
        if (accountsData.length > 0) {
          setSelectedAccount(accountsData[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    // Block uploads in demo mode
    if (isDemoOverlayEnabled()) {
      toast.info('Demo mode: uploads are disabled.', {
        action: {
          label: 'Exit demo',
          onClick: () => { try { setDemoOverlayEnabled(false); } catch {} window.location.reload(); }
        },
        duration: 3500,
      });
      return;
    }

    // Validate file type (PDF, CSV, Images)
    const allowedTypes = [
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif'
    ];
    if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().match(/\.(jpg|jpeg|png|webp|heic|heif)$/)) {
      toast.error('Please upload a PDF, CSV, or Image file');
      return;
    }

    setIsProcessing(true);
    setUploadProgress(0);
    setParsedTransactions([]);
    setValidTransactions([]);
    setInvalidTransactions([]);
    setImportStats(null);
    setCurrentFileName(file.name);
    setUploadedFile(file);
    setSavedToSupabase(false);
    setProcessingTotalParts(null);
    setProcessingCurrentPart(0);
    setProcessingStatus('Analyzing file...');

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      let transactions: ParsedTransaction[] = [];

      // Always use Nanonets API for real file processing
      if (file.name.endsWith('.csv') && demoMode) {
        // Fallback: Parse CSV directly only in demo mode
        toast.info('Processing CSV file (Demo Mode)...');
        const csvContent = await file.text();
        transactions = DemoCSVParser.parseCSVContent(csvContent);
      } else {
        // Primary mode: Use Nanonets API for both PDF and CSV
        const isPdf = file.type.toLowerCase().includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
        toast.info(`Processing ${isPdf ? 'PDF' : 'CSV'} file with Nanonets AI...`);
        console.log('🔄 Preparing file for Nanonets API:', {
          fileName: file.name,
          fileSize: `${(file.size / 1024).toFixed(1)} KB`,
          fileType: file.type
        });

        if (isPdf) {
          // Split PDFs > 5 pages using PDF.co, then process each part
          setProcessingStatus('Checking pages and splitting large PDF...');
          const parts = await splitPdfIfNeeded(file, 5);
          if (parts.length > 1) {
            toast.info(`📄 Large PDF detected. Split into ${parts.length} parts (max 5 pages each).`);
          }
          setProcessingTotalParts(parts.length);
          let allTransactions: ParsedTransaction[] = [];
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            console.log(`📤 Sending split part ${i + 1}/${parts.length} to Nanonets:`, {
              fileName: part.name,
              fileSize: `${(part.size / 1024).toFixed(1)} KB`,
            });
            setProcessingCurrentPart(i + 1);
            setProcessingStatus(`Processing part ${i + 1} of ${parts.length} with AI...`);
            const resp = await nanonetsAPI.processFile(part);
            if (i === 0) setNanonetsResponse(resp); // keep first response for debug download
            const txns = nanonetsAPI.parseTransactions(resp);
            console.log(`📊 Part ${i + 1}: extracted ${txns.length} transactions`);
            allTransactions = allTransactions.concat(txns);
          }
          setProcessingStatus('Aggregating results...');
          transactions = allTransactions;
          console.log('📊 Total parsed transactions from all parts:', transactions.length);
          if (transactions.length > 0) {
            console.log('💰 Sample transactions:', transactions.slice(0, 3));
          }
        } else {
          // Non-PDF: send directly
          setProcessingStatus('Uploading to AI and extracting...');
          const nanonetsApiResponse = await nanonetsAPI.processFile(file);
          console.log('✅ Nanonets API Response received');
          setNanonetsResponse(nanonetsApiResponse);
          transactions = nanonetsAPI.parseTransactions(nanonetsApiResponse);
          console.log('📊 Parsed Transactions:', transactions.length, 'transactions found');
          if (transactions.length > 0) {
            console.log('💰 Sample transactions:', transactions.slice(0, 3));
          }
        }
      }
      
      setParsedTransactions(transactions);

      // Validate transactions
      const { valid, invalid } = nanonetsAPI.validateTransactions(transactions);
      setValidTransactions(valid);
      setInvalidTransactions(invalid);

      // Calculate stats
      const stats = calculateImportStats(valid);
      setImportStats(stats);

      setUploadProgress(100);
      
      if (transactions.length > 0) {
        toast.success(`🎉 Successfully processed ${transactions.length} transactions from ${file.name}`);
      } else {
        toast.warning('⚠️ No transactions found in the file. Please check the file format.');
      }
      
    } catch (error) {
      console.error('💥 Error processing file:', error);
      
      // More specific error messages
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('403')) {
          toast.error('🔐 API Authentication failed. Please check your Nanonets API key.');
        } else if (error.message.includes('413') || error.message.includes('too large')) {
          toast.error('📄 File too large. Please use files smaller than 10MB.');
        } else if (error.message.includes('unsupported') || error.message.includes('format')) {
          toast.error('📄 Unsupported file format. Please use PDF or CSV files.');
        } else {
          toast.error(`❌ Processing failed: ${error.message}`);
        }
      } else {
        toast.error('❌ Failed to process file. Please try again or contact support.');
      }
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
      setProcessingTotalParts(null);
      setProcessingCurrentPart(0);
    }
  }, []);

  const calculateImportStats = (transactions: ParsedTransaction[]): ImportStats => {
    const stats: ImportStats = {
      totalTransactions: transactions.length,
      totalAmount: 0,
      incomeCount: 0,
      expenseCount: 0,
      incomeAmount: 0,
      expenseAmount: 0,
    };

    transactions.forEach(t => {
      if (t.type === 'income') {
        stats.incomeCount++;
        stats.incomeAmount += t.amount;
      } else {
        stats.expenseCount++;
        stats.expenseAmount += t.amount;
      }
    });

    stats.totalAmount = stats.incomeAmount - stats.expenseAmount;
    return stats;
  };

  // Old import function removed - using addToSupabase instead

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isDemoOverlayEnabled()) {
      toast.info('Demo mode: uploads are disabled.', {
        action: {
          label: 'Exit demo',
          onClick: () => { try { setDemoOverlayEnabled(false); } catch {} window.location.reload(); }
        },
        duration: 3500,
      });
      // Clear selection so user can try again later
      try { (event.target as HTMLInputElement).value = ''; } catch {}
      return;
    }
    const files = event.target.files;
    if (files && files.length > 0) {
      onDrop([files[0]]);
    }
  };

  const loadSampleData = () => {
    // Sample CSV data for testing
    const sampleCSV = `Date,Description,Amount,Type
2024-01-15,Starbucks Coffee,-4.50,Debit
2024-01-16,Salary Deposit,3500.00,Credit
2024-01-17,Grocery Store,-85.23,Debit
2024-01-18,Gas Station,-45.00,Debit
2024-01-19,Netflix Subscription,-15.99,Debit
2024-01-20,Amazon Purchase,-129.99,Debit
2024-01-22,Restaurant Dinner,-67.50,Debit
2024-01-23,Uber Ride,-18.75,Debit
2024-01-24,Electric Bill,-120.00,Debit
2024-01-25,Freelance Payment,850.00,Credit
2024-01-26,Pharmacy,-25.50,Debit
2024-01-28,Movie Theater,-24.00,Debit
2024-01-29,Grocery Store,-92.15,Debit
2024-01-30,Internet Bill,-79.99,Debit`;

    // Create a fake file object
    const blob = new Blob([sampleCSV], { type: 'text/csv' });
    const file = new File([blob], 'sample-transactions.csv', { type: 'text/csv' });
    
    // Process the sample data
    onDrop([file]);
  };

  const downloadNanonetsResponse = () => {
    if (!nanonetsResponse) {
      toast.error('No Nanonets response to download');
      return;
    }

    const dataStr = JSON.stringify(nanonetsResponse, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `nanonets-response-${currentFileName || 'file'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success('Nanonets response downloaded!');
  };

  // Save uploaded file to browser storage
  const saveFileToStorage = async (file: File) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result as string;
        const fileData = {
          name: file.name,
          type: file.type,
          size: file.size,
          data: base64Data,
          uploadDate: new Date().toISOString()
        };
        
        // Get existing files from storage
        const existingFiles = JSON.parse(localStorage.getItem('uploaded-files') || '[]');
        
        // Add new file (keep last 10 files to avoid storage limits)
        const updatedFiles = [fileData, ...existingFiles].slice(0, 10);
        
        // Save to localStorage
        localStorage.setItem('uploaded-files', JSON.stringify(updatedFiles));
        
        console.log('📁 File saved to browser storage:', file.name);
        toast.success(`File ${file.name} saved to browser storage`);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('❌ Error saving file to storage:', error);
      toast.error('Failed to save file to browser storage');
    }
  };

  // Add transactions to Supabase database
  const ensureImportAccount = async (): Promise<string | null> => {
    if (!api) return null;
    try {
      // Prefer already selected account
      if (selectedAccount) return selectedAccount;
      // Use loaded accounts if present
      let accs = accounts;
      if (!accs || accs.length === 0) {
        accs = await api.getAccounts();
      }
      if (accs && accs.length > 0) {
        const id = accs[0].id;
        setSelectedAccount(id);
        return id;
      }
      // None exist: create default
      const createdId = await api.createAccount({
        name: 'Imported Transactions',
        type: 'checking',
        balance: 0,
        closed: false,
      });
      const refreshed = await api.getAccounts();
      setAccounts(refreshed);
      setSelectedAccount(createdId);
      toast.success('Created default account: Imported Transactions');
      return createdId;
    } catch (e) {
      console.error('Failed to ensure default account:', e);
      return null;
    }
  };

  const addToSupabase = async () => {
    if (!api || validTransactions.length === 0) {
      toast.error('No valid transactions to add');
      return;
    }
    // Ensure an account exists and is selected
    const ensuredAccountId = await ensureImportAccount();
    if (!ensuredAccountId) {
      toast.error('Could not ensure an account to import into');
      return;
    }

    setIsProcessing(true);
    setSavedToSupabase(false);

    try {
      let successCount = 0;
      let errorCount = 0;
      const savedForBackground: { id: string; date: string; description: string; amount: number }[] = [];

      console.log('💾 Adding', validTransactions.length, 'transactions to Supabase...');

      const tryCreate = async (payload: any) => {
        try {
          const id = await api.addTransaction(payload);
          return { ok: true as const, id };
        } catch (e) {
          return { ok: false as const, error: e };
        }
      };

      const createWithFallbacks = async (transaction: ParsedTransaction) => {
        const finalAmount = transaction.type === 'expense' ? -transaction.amount : transaction.amount;
        const basePayload: any = {
          account: ensuredAccountId,
          amount: finalAmount,
          payee: (transaction.description || 'Unknown Transaction').trim().slice(0, 100),
          date: transaction.date,
          notes: `Imported from ${currentFileName}`,
        };
        let res = await tryCreate(basePayload);
        if (!res.ok) {
          const minimal = {
            account: ensuredAccountId,
            amount: finalAmount,
            date: transaction.date,
            payee: (transaction.description || 'Unknown').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 60),
          };
          res = await tryCreate(minimal);
        }
        if (res.ok) {
          return { ok: true as const, id: res.id, finalAmount, date: transaction.date, description: transaction.description };
        }
        return { ok: false as const, error: (res as any).error, transaction };
      };

      const results = await Promise.allSettled(validTransactions.map(t => createWithFallbacks(t)));
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.ok) {
          savedForBackground.push({ id: r.value.id, date: r.value.date, description: r.value.description, amount: r.value.finalAmount });
          successCount++;
        } else {
          const err = r.status === 'rejected' ? r.reason : r.value.error;
          console.error('Failed to add transaction after retries:', r.status === 'rejected' ? null : r.value.transaction, err);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`✅ Successfully added ${successCount} transactions to database!`);
        setSavedToSupabase(true);
        
        // Create import history record
        const totalAmount = validTransactions.reduce((sum, t) => 
          sum + (t.type === 'expense' ? -t.amount : t.amount), 0
        );
        const importRecord = createImportRecord(
          currentFileName || 'imported-file',
          validTransactions.length,
          successCount,
          totalAmount
        );
        
        // Add to history (using global function)
        if ((window as any).addImportRecord) {
          (window as any).addImportRecord(importRecord);
        }

        // Save the uploaded file to browser storage
        if (uploadedFile) {
          await saveFileToStorage(uploadedFile);
        }

        if (savedForBackground.length > 0) {
          toast.info('🤖 Categorizing in background…');
          (async () => {
            try {
              const allTx = await api.getTransactions();
              const savedMap = new Map(savedForBackground.map(x => [x.id, x]));
              const targets = allTx
                .filter(t => savedMap.has(t.id) && (!t.category || t.category === '' || t.category === 'Uncategorized'))
                .sort((a, b) => (a.date < b.date ? 1 : -1));

              setIsCatRunning(true);
              setCatProcessed(0);
              setCatUpdated(0);
              setCatTotal(targets.length);
              stopRef.current = false;

              for (const t of targets) {
                if (stopRef.current) break;
                try {
                  const desc = (t.payee || savedMap.get(t.id)?.description || t.notes || '').toString();
                  const result = await aiCategorizer.categorizeTransaction({
                    description: desc,
                    amount: t.amount,
                    date: t.date,
                  });
                  if (result && result.category) {
                    await api.updateTransaction(t.id, { category: result.category });
                    setCatUpdated(prev => prev + 1);
                  }
                } catch {}
                setCatProcessed(prev => prev + 1);
                await new Promise(r => setTimeout(r, 75));
              }

              if (stopRef.current) {
                toast.info(`Stopped categorization after ${catProcessed}/${catTotal} (updated ${catUpdated})`);
              } else {
                toast.success('✅ Background categorization complete');
              }
            } catch {}
            finally {
              setIsCatRunning(false);
            }
          })();
        }
      }
      
      if (errorCount > 0) {
        toast.error(`❌ Failed to add ${errorCount} transactions`);
      }

    } catch (error) {
      console.error('💥 Error adding transactions to Supabase:', error);
      toast.error('Failed to add transactions to database');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-emerald bg-clip-text text-transparent">
            <span className="hidden sm:inline">Import Transactions</span>
            <span className="sm:hidden">Import</span>
          </h1>
          <p className="text-muted-foreground mt-2 text-sm md:text-base">
            <span className="hidden sm:inline">Upload PDF bank statements or CSV files - AI will extract and categorize your transactions automatically</span>
            <span className="sm:hidden">Upload files - AI extracts & categorizes</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 md:gap-4 text-xs md:text-sm">
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden xs:inline">Nanonets AI Processing</span>
              <span className="xs:hidden">AI Processing</span>
            </span>
            <span className="flex items-center gap-1 text-blue-600">
              <FileText className="w-3 h-3 md:w-4 md:h-4" />
              PDF & CSV Support
            </span>
          </div>
        </div>
      </div>


      {/* Upload Area */}
      <Card className="border-dashed border-2 border-accent/30">
        <CardContent className="p-4 md:p-8">
          <div className="text-center">
            <Upload className="mx-auto h-10 w-10 md:h-12 md:w-12 text-accent mb-4" />
            <h3 className="text-base md:text-lg font-semibold mb-2">
              <span className="hidden sm:inline">Upload Your Bank Files</span>
              <span className="sm:hidden">Upload Files</span>
            </h3>
            <p className="text-muted-foreground mb-4 text-sm md:text-base">
              <span className="hidden sm:inline">AI will automatically extract transactions, detect amounts, categorize expenses, and parse dates from your files and photos</span>
              <span className="sm:hidden">AI extracts & categorizes from files/photos</span>
            </p>
            <div className="flex justify-center gap-2 md:gap-4 text-xs md:text-sm text-muted-foreground mb-4">
              <span className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                PDF
              </span>
              <span className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                CSV
              </span>
              <span className="flex items-center gap-1">
                <ImageIcon className="w-4 h-4" />
                Photo (JPG/PNG/WEBP/HEIC)
              </span>
            </div>
            <input
              type="file"
              accept=".pdf,.csv,image/*"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              id="photo-upload"
              capture="environment"
            />
            {/* Mobile: Stacked buttons */}
            <div className="md:hidden space-y-3">
              <Button asChild className="bg-gradient-emerald hover:opacity-90 w-full h-12 text-sm">
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer"
                  onClick={(e) => {
                    if (isDemoOverlayEnabled()) {
                      e.preventDefault();
                      toast.info('Demo mode: uploads are disabled.', {
                        action: { label: 'Exit demo', onClick: () => { try { setDemoOverlayEnabled(false); } catch {} window.location.reload(); } },
                        duration: 3500,
                      });
                    }
                  }}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Select Bank File
                </label>
              </Button>
              <Button asChild variant="outline" className="w-full h-12 text-sm">
                <label
                  htmlFor="photo-upload"
                  className="cursor-pointer"
                  onClick={(e) => {
                    if (isDemoOverlayEnabled()) {
                      e.preventDefault();
                      toast.info('Demo mode: uploads are disabled.', {
                        action: { label: 'Exit demo', onClick: () => { try { setDemoOverlayEnabled(false); } catch {} window.location.reload(); } },
                        duration: 3500,
                      });
                    }
                  }}
                >
                  <ImageIcon className="w-4 h-4 mr-2" />
                  Select Photo
                </label>
              </Button>
            </div>
            
            {/* Desktop: Side by side buttons */}
            <div className="hidden md:flex gap-3 justify-center">
              <Button asChild className="bg-gradient-emerald hover:opacity-90 text-lg px-8 py-3">
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer"
                  onClick={(e) => {
                    if (isDemoOverlayEnabled()) {
                      e.preventDefault();
                      toast.info('Demo mode: uploads are disabled.', {
                        action: { label: 'Exit demo', onClick: () => { try { setDemoOverlayEnabled(false); } catch {} window.location.reload(); } },
                        duration: 3500,
                      });
                    }
                  }}
                >
                  <Upload className="w-5 h-5 mr-2" />
                  Select Bank File
                </label>
              </Button>
              <Button asChild variant="outline" className="text-lg px-8 py-3">
                <label
                  htmlFor="photo-upload"
                  className="cursor-pointer"
                  onClick={(e) => {
                    if (isDemoOverlayEnabled()) {
                      e.preventDefault();
                      toast.info('Demo mode: uploads are disabled.', {
                        action: { label: 'Exit demo', onClick: () => { try { setDemoOverlayEnabled(false); } catch {} window.location.reload(); } },
                        duration: 3500,
                      });
                    }
                  }}
                >
                  <ImageIcon className="w-5 h-5 mr-2" />
                  Select Photo
                </label>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              <span className="hidden sm:inline">Supported: Chase, Bank of America, Wells Fargo, Citi, Capital One, and more. You can also upload photos of statements/receipts.</span>
              <span className="sm:hidden">Supports major banks + photos</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Processing Progress */}
      {isProcessing && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 animate-pulse" />
              Processing File...
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={uploadProgress} className="mb-2" />
            <div className="flex items-start gap-4">
              {/* Spinner with gradient ring */}
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-4 border-t-transparent border-accent animate-spin" />
                <div className="absolute inset-2 rounded-full bg-muted" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-1">
                  {processingStatus || (uploadProgress < 30 ? 'Uploading to Nanonets AI...' : uploadProgress < 60 ? 'OCR processing document...' : uploadProgress < 90 ? 'Extracting transaction data...' : 'Validating transactions...')}
                </p>
                {/* Animated dots */}
                <div className="h-5 text-accent font-medium">
                  Working
                  <span className="inline-block animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                  <span className="inline-block animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                  <span className="inline-block animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                </div>
                {processingTotalParts && processingTotalParts > 1 && (
                  <div className="mt-3">
                    <div className="text-xs text-muted-foreground mb-1">
                      Split parts progress: {processingCurrentPart}/{processingTotalParts}
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div
                        className="bg-accent h-1.5 rounded-full transition-all"
                        style={{ width: `${(processingCurrentPart / processingTotalParts) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
                {funTip && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    {funTip}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debug Tools */}
      {nanonetsResponse && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Debug Tools
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={downloadNanonetsResponse}
              variant="outline"
              className="border-accent/30 hover:bg-accent/10"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Nanonets Response
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Download the raw JSON response from Nanonets API for debugging
            </p>
          </CardContent>
        </Card>
      )}

      {/* Import Stats */}
      {importStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-accent" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Transactions</p>
                  <p className="text-2xl font-bold">{importStats.totalTransactions}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Income</p>
                  <p className="text-2xl font-bold text-green-500">
                    {formatAmountFromCents(importStats.incomeAmount)}
                  </p>
                  <p className="text-xs text-muted-foreground">{importStats.incomeCount} transactions</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Expenses</p>
                  <p className="text-2xl font-bold text-red-500">
                    {formatAmountFromCents(importStats.expenseAmount)}
                  </p>
                  <p className="text-xs text-muted-foreground">{importStats.expenseCount} transactions</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-accent" />
                <div>
                  <p className="text-sm text-muted-foreground">Net Amount</p>
                  <p className={`text-2xl font-bold ${importStats.totalAmount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {formatAmountFromCents(importStats.totalAmount)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Account Selection & Import */}
      {validTransactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Import to Account</CardTitle>
            <CardDescription>
              Select the account to import these transactions to
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Select Account</label>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="w-full mt-1 p-2 border rounded-md bg-background"
              >
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({formatAmount(account.balance)})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={addToSupabase}
                disabled={isProcessing || savedToSupabase}
                className={savedToSupabase ? "bg-green-600 hover:bg-green-700" : "bg-gradient-emerald hover:opacity-90"}
              >
                {savedToSupabase ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Added to Database ✅
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Add {validTransactions.length} to Database
                  </>
                )}
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => {
                  setParsedTransactions([]);
                  setValidTransactions([]);
                  setInvalidTransactions([]);
                  setImportStats(null);
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction Preview */}
      {validTransactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Transaction Preview</CardTitle>
            <CardDescription>
              Review transactions before importing ({validTransactions.length} valid, {invalidTransactions.length} invalid)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {validTransactions.slice(0, 10).map((transaction, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium">{transaction.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {transaction.date} • {transaction.category}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${transaction.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                      {transaction.type === 'expense' ? '-' : '+'}
                      {formatAmountFromCents(transaction.amount)}
                    </p>
                    <Badge variant={transaction.type === 'income' ? 'default' : 'secondary'}>
                      {transaction.type}
                    </Badge>
                  </div>
                </div>
              ))}
              
              {validTransactions.length > 10 && (
                <p className="text-center text-muted-foreground py-2">
                  ... and {validTransactions.length - 10} more transactions
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invalid Transactions */}
      {invalidTransactions.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600">Invalid Transactions</CardTitle>
            <CardDescription>
              These transactions could not be processed and will be skipped
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {invalidTransactions.map((item, index) => (
                <div key={index} className="p-3 border border-red-200 rounded-lg bg-red-50">
                  <p className="font-medium text-red-800">{item.transaction.description || 'Unknown'}</p>
                  <p className="text-sm text-red-600">
                    Errors: {item.errors.join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import History and Saved Files */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ImportHistory />
        <SavedFiles />
      </div>

      {isCatRunning && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg bg-white text-black border border-gray-200 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="min-w-[180px]">
              <div className="text-xs font-semibold tracking-wide">Categorising</div>
              <div className="text-xs font-mono mt-0.5">
                Categorised {catUpdated}/{catTotal} • Left {Math.max(catTotal - catProcessed, 0)}
              </div>
              <div className="mt-2 h-1.5 w-full bg-gray-100 rounded">
                <div
                  className="h-1.5 rounded bg-black"
                  style={{ width: `${catTotal > 0 ? Math.min(100, Math.round((catProcessed / catTotal) * 100)) : 0}%` }}
                />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { stopRef.current = true; }}
              className="h-7 px-2 text-xs"
            >
              Stop
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
