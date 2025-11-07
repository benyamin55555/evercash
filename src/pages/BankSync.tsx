import { useState, useEffect } from "react";
import { Link2, CheckCircle2, AlertCircle, Loader2, Trash2, RefreshCw, Settings, Download, Upload, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BankSyncModal } from "@/components/BankSyncModal";
import { useApi } from "@/contexts/HybridApiContext";
import { toast } from "sonner";

interface BankConnection {
  id: string;
  name: string;
  institution: string;
  type: 'plaid' | 'simplefin' | 'gocardless' | 'csv';
  status: 'connected' | 'error' | 'expired';
  lastSync: string;
  accountCount: number;
  transactionCount: number;
}

export default function BankSync() {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { api } = useApi();

  useEffect(() => {
    loadConnections();
    checkPendingImport();
  }, []);

  const loadConnections = () => {
    // Load from localStorage (in production, this would come from API)
    const stored = localStorage.getItem('bank_connections');
    if (stored) {
      setConnections(JSON.parse(stored));
    } else {
      // No connections yet - start with empty array
      setConnections([
      ]);
    }
  };

  const checkPendingImport = async () => {
    const pendingImport = localStorage.getItem('pending_import');
    if (pendingImport && api) {
      try {
        const importResult = JSON.parse(pendingImport);
        
        // Process the imported transactions
        if (importResult.transactions && importResult.transactions.length > 0) {
          toast.success(`Ready to import ${importResult.transactions.length} transactions`);
          
          // You could show an import confirmation dialog here
          // For now, we'll just clear the pending import
          localStorage.removeItem('pending_import');
        }
      } catch (error) {
        console.error('Error processing pending import:', error);
        localStorage.removeItem('pending_import');
      }
    }
  };

  const handleSync = async (connectionId: string) => {
    setLoading(true);
    try {
      const connection = connections.find(c => c.id === connectionId);
      if (!connection) return;

      // Simulate sync process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update connection status
      setConnections(prev => prev.map(c => 
        c.id === connectionId 
          ? { ...c, status: 'connected' as const, lastSync: new Date().toISOString() }
          : c
      ));
      
      toast.success(`Synced ${connection.name} successfully`);
    } catch (error) {
      toast.error('Sync failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = (connectionId: string) => {
    const connection = connections.find(c => c.id === connectionId);
    if (!connection) return;

    setConnections(prev => prev.filter(c => c.id !== connectionId));
    toast.success(`Disconnected ${connection.name}`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Connected</Badge>;
      case 'error':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Error</Badge>;
      case 'expired':
        return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20">Expired</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'plaid':
        return '🏦';
      case 'simplefin':
        return '🔗';
      case 'gocardless':
        return '🌍';
      case 'csv':
        return '📄';
      default:
        return '💳';
    }
  };

  const formatLastSync = (lastSync: string) => {
    const date = new Date(lastSync);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      return 'Just now';
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  };

  return (
    <div className="space-y-6 p-6 relative">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-emerald bg-clip-text text-transparent">
            Bank Sync
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your bank connections and automatic transaction imports
          </p>
        </div>
        <Button 
          onClick={() => setSyncModalOpen(true)}
          className="bg-gradient-emerald hover:opacity-90 transition-opacity shadow-[0_0_20px_rgba(123,239,45,0.3)]"
        >
          <Link2 className="w-5 h-5 mr-2" />
          Add Connection
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-card border-accent/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Connections</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{connections.length}</div>
          </CardContent>
        </Card>
        
        <Card className="glass-card border-accent/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {connections.filter(c => c.status === 'connected').length}
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card border-accent/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {connections.reduce((sum, c) => sum + c.accountCount, 0)}
            </div>
          </CardContent>
        </Card>
        
        <Card className="glass-card border-accent/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Transactions Synced</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {connections.reduce((sum, c) => sum + c.transactionCount, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Connections List */}
      <Card className="glass-card border-accent/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Bank Connections
          </CardTitle>
          <CardDescription>
            Manage your connected banks and financial institutions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connections.length === 0 ? (
            <div className="text-center py-8">
              <Link2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No bank connections</h3>
              <p className="text-muted-foreground mb-4">
                Connect your bank to automatically import transactions
              </p>
              <Button onClick={() => setSyncModalOpen(true)}>
                <Link2 className="w-4 h-4 mr-2" />
                Add First Connection
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {connections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-accent/10 hover:border-accent/20 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-2xl">{getTypeIcon(connection.type)}</div>
                    <div>
                      <h4 className="font-semibold">{connection.name}</h4>
                      <p className="text-sm text-muted-foreground">{connection.institution}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(connection.status)}
                        <span className="text-xs text-muted-foreground">
                          Last sync: {formatLastSync(connection.lastSync)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="text-right text-sm">
                      <div className="font-medium">{connection.accountCount} accounts</div>
                      <div className="text-muted-foreground">{connection.transactionCount} transactions</div>
                    </div>
                    
                    <div className="flex items-center gap-1 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSync(connection.id)}
                        disabled={loading}
                      >
                        {loading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDisconnect(connection.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Settings */}
      <Card className="glass-card border-accent/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Sync Settings
          </CardTitle>
          <CardDescription>
            Configure automatic sync preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Automatic Sync</h4>
              <p className="text-sm text-muted-foreground">
                Automatically sync transactions every 24 hours
              </p>
            </div>
            <Button variant="outline" size="sm">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Enabled
            </Button>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Import Rules</h4>
              <p className="text-sm text-muted-foreground">
                Automatically categorize imported transactions
              </p>
            </div>
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-2" />
              Configure
            </Button>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Duplicate Detection</h4>
              <p className="text-sm text-muted-foreground">
                Prevent importing duplicate transactions
              </p>
            </div>
            <Button variant="outline" size="sm">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Enabled
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bank Sync Modal */}
      <BankSyncModal 
        open={syncModalOpen} 
        onOpenChange={setSyncModalOpen}
      />
      {/* Locked overlay */}
      <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-md flex items-center justify-center">
        <button
          aria-label="Close"
          onClick={() => navigate(-1)}
          className="absolute top-4 right-4 p-2 rounded-full bg-background/70 border border-border hover:bg-accent/10 transition"
        >
          {/* using an SVG X to avoid extra imports */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="glass-card border border-accent/20 rounded-2xl p-8 md:p-10 text-center shadow-2xl">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <Lock className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Coming Soon</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            This feature will be available within a few days.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">— Regards, Evercash</p>
        </div>
      </div>
    </div>
  );
}
