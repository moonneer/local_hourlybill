import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatHours, safeParseFloat } from "@/lib/utils";
import { Save, RefreshCw, FileText, Plus, Upload, Trash2, Mail, Clock, Briefcase, FileDown, Inbox, AlertCircle } from "lucide-react";

type EntryType = 'time' | 'expense' | 'potential_expense';

interface TimeEntry {
  matter?: string;
  date?: string;
  description?: string;
  predicted_time?: number;
  billing_rate?: number;
  amount_charged?: number;
  user_name?: string;
  entry_type: EntryType;
  documents?: Array<{
    source_email_id?: string;
    subject?: string;
    attachment_filename?: string;
    from?: string;
  }>;
  __id?: number;
  __draft?: boolean;
}

export default function TimeEntriesPage() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const selectedQuery = searchParams.get("query") || "";
  const queryClient = useQueryClient();

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [billInfo, setBillInfo] = useState({ client_name: "", user_name: "", billing_rate: 0, timezone: "" });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const nextId = useRef(Date.now());

  // Queries
  const { data: queriesData } = useQuery<{ queries: string[] }>({ queryKey: ["/api/queries"] });
  const { data: timeEntriesData, isLoading: isLoadingEntries, error: entriesError } = useQuery({
    queryKey: ["/api/time-entries", selectedQuery],
    queryFn: async () => {
      if (!selectedQuery) return null;
      const res = await apiRequest("GET", `/api/time-entries?query=${encodeURIComponent(selectedQuery)}`);
      return res.json();
    },
    enabled: !!selectedQuery,
  });

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", `/api/time-entries?query=${encodeURIComponent(selectedQuery)}`, data);
    },
    onSuccess: () => {
      toast({ title: "Saved successfully", description: "Your changes have been saved." });
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries", selectedQuery] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    }
  });

  useEffect(() => {
    if (timeEntriesData) {
      setBillInfo({
        client_name: timeEntriesData.client_name || "",
        user_name: timeEntriesData.user_name || "",
        billing_rate: timeEntriesData.billing_rate || 0,
        timezone: timeEntriesData.timezone || "",
      });
      setEntries(
        (timeEntriesData.entries || []).map((e: any, i: number) => ({ ...e, __id: nextId.current++ }))
      );
      setHasUnsavedChanges(false);
    } else if (!selectedQuery) {
      setEntries([]);
      setBillInfo({ client_name: "", user_name: "", billing_rate: 0, timezone: "" });
    }
  }, [timeEntriesData, selectedQuery]);

  const handleQueryChange = (val: string) => {
    if (hasUnsavedChanges && !window.confirm("You have unsaved changes. Discard?")) return;
    setLocation(`/?query=${encodeURIComponent(val)}`);
  };

  const updateBillInfo = (field: string, value: any) => {
    setBillInfo(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const updateEntry = (id: number, field: keyof TimeEntry, value: any) => {
    setEntries(prev => prev.map(e => {
      if (e.__id !== id) return e;
      const updated = { ...e, [field]: value };
      if (field === 'predicted_time' || field === 'billing_rate') {
        const time = safeParseFloat(updated.predicted_time);
        const rate = safeParseFloat(updated.billing_rate);
        updated.amount_charged = time * rate;
      }
      return updated;
    }));
    setHasUnsavedChanges(true);
  };

  const addEntry = () => {
    setEntries([{
      __id: nextId.current++,
      __draft: true,
      entry_type: 'time',
      matter: "",
      date: new Date().toISOString().split('T')[0],
      description: "",
      predicted_time: 0,
      billing_rate: billInfo.billing_rate,
      amount_charged: 0,
      user_name: billInfo.user_name,
    }, ...entries]);
    setHasUnsavedChanges(true);
  };

  const deleteEntry = (id: number) => {
    setEntries(prev => prev.filter(e => e.__id !== id));
    setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    const cleanEntries = entries.map(({ __id, __draft, ...rest }) => rest);
    // Sort logic: by matter, then time vs expense, then date
    cleanEntries.sort((a, b) => {
      if (a.matter !== b.matter) return (a.matter || "").localeCompare(b.matter || "");
      if (a.entry_type !== b.entry_type) return a.entry_type === 'time' ? -1 : 1;
      return (a.date || "").localeCompare(b.date || "");
    });
    
    saveMutation.mutate({
      ...billInfo,
      entries: cleanEntries
    });
  };

  // Grouping
  const groupedEntries = useMemo(() => {
    const groups: Record<string, TimeEntry[]> = {};
    const unsaved: TimeEntry[] = [];
    
    entries.forEach(e => {
      if (e.__draft) {
        unsaved.push(e);
      } else {
        const m = e.matter || 'Uncategorized';
        if (!groups[m]) groups[m] = [];
        groups[m].push(e);
      }
    });
    
    return { unsaved, groups };
  }, [entries]);

  return (
    <div className="max-w-[1200px] mx-auto w-full min-w-0 p-3 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 animate-in fade-in duration-500 pb-24">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Time Entries</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Review and refine AI-generated billing items.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto min-w-0">
          <Select value={selectedQuery} onValueChange={handleQueryChange}>
            <SelectTrigger className="w-full sm:w-[280px] min-w-0 bg-white shadow-sm border-border/80 h-11 sm:h-10 touch-manipulation">
              <SelectValue placeholder="Select a matter..." />
            </SelectTrigger>
            <SelectContent>
              {queriesData?.queries?.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">No matters found</div>
              ) : (
                queriesData?.queries?.map(q => (
                  <SelectItem key={q} value={q}>{q}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/time-entries", selectedQuery] })} disabled={!selectedQuery} className="h-10 w-10 shrink-0 bg-white">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {entriesError && (
        <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm text-destructive font-medium">Failed to load entries: {(entriesError as Error).message}</div>
        </div>
      )}

      {!selectedQuery && !isLoadingEntries && (
        <div className="mt-12 flex flex-col items-center justify-center p-12 text-center bg-white border border-border/60 border-dashed rounded-2xl shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <Inbox className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No Matter Selected</h2>
          <p className="text-muted-foreground max-w-sm mb-6">
            Select an existing matter from the dropdown above, or create a new matter to start generating time entries.
          </p>
          <Button onClick={() => setLocation('/query')} className="shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            Create New Matter
          </Button>
        </div>
      )}

      {selectedQuery && !isLoadingEntries && (
        <>
          {/* Bill Info Header */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-border/60">
            <div className="flex flex-col md:flex-row justify-between gap-6">
              <div className="space-y-4 flex-1">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Client</div>
                  <Input 
                    value={billInfo.client_name} 
                    onChange={e => updateBillInfo('client_name', e.target.value)}
                    className="text-xl font-semibold h-auto py-1 px-0 border-transparent hover:border-border focus-visible:border-primary focus-visible:ring-0 bg-transparent rounded-sm shadow-none w-full max-w-sm transition-colors"
                    placeholder="Enter client name..."
                  />
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-2 border-t border-border/40">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Professional</Label>
                    <Input value={billInfo.user_name} onChange={e => updateBillInfo('user_name', e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Default Rate ($/hr)</Label>
                    <Input type="number" value={billInfo.billing_rate} onChange={e => updateBillInfo('billing_rate', parseFloat(e.target.value))} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5 hidden sm:block">
                    <Label className="text-xs text-muted-foreground">Timezone</Label>
                    <Input value={billInfo.timezone} onChange={e => updateBillInfo('timezone', e.target.value)} className="h-8 text-sm" />
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end justify-between border-l border-border/40 pl-6 shrink-0">
                <div className="text-right mb-6 md:mb-0">
                  <div className="text-sm font-medium text-muted-foreground mb-1">Total Unbilled</div>
                  <div className="text-3xl font-bold text-primary tracking-tight">
                    {formatCurrency(entries.reduce((sum, e) => sum + (e.amount_charged || 0), 0))}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {formatHours(entries.reduce((sum, e) => sum + (e.entry_type === 'time' ? (e.predicted_time || 0) : 0), 0))} recorded
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" onClick={() => setLocation(`/pdf?query=${selectedQuery}`)} disabled={!selectedQuery}>
                    <FileText className="w-4 h-4 mr-2" />
                    Preview Invoice
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={!selectedQuery || saveMutation.isPending} className="min-w-[100px] shadow-sm relative">
                    {saveMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save
                    {hasUnsavedChanges && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span></span>}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Entries</h3>
            <div className="flex gap-2">
              <Button onClick={addEntry} size="sm" variant="secondary" className="shadow-sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Manual Entry
              </Button>
            </div>
          </div>

          {/* Entries List */}
          <div className="space-y-10">
            {groupedEntries.unsaved.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-amber-200">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <h3 className="text-sm font-semibold text-amber-600 uppercase tracking-wider">New / Unsaved Entries</h3>
                </div>
                <div className="grid gap-3">
                  {groupedEntries.unsaved.map(entry => (
                    <EntryCard key={entry.__id} entry={entry} updateEntry={updateEntry} deleteEntry={deleteEntry} />
                  ))}
                </div>
              </div>
            )}

            {Object.entries(groupedEntries.groups).sort(([a], [b]) => a.localeCompare(b)).map(([matter, matterEntries]) => {
              const totalAmount = matterEntries.reduce((sum, e) => sum + (e.amount_charged || 0), 0);
              const totalHours = matterEntries.reduce((sum, e) => sum + (e.entry_type === 'time' ? (e.predicted_time || 0) : 0), 0);

              return (
                <div key={matter} className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{matter}</h3>
                    </div>
                    <div className="text-sm font-medium">
                      <span className="text-muted-foreground mr-3">{formatHours(totalHours)}</span>
                      <span className="text-foreground">{formatCurrency(totalAmount)}</span>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {matterEntries.map(entry => (
                      <EntryCard key={entry.__id} entry={entry} updateEntry={updateEntry} deleteEntry={deleteEntry} />
                    ))}
                  </div>
                </div>
              );
            })}
            
            {entries.length === 0 && (
              <div className="py-12 text-center text-muted-foreground border border-border/40 border-dashed rounded-xl bg-white/50">
                No entries found for this matter. Run an analysis or add entries manually.
              </div>
            )}
          </div>
        </>
      )}

      {isLoadingEntries && (
        <div className="space-y-8 mt-8">
          <Skeleton className="h-[200px] w-full rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-[120px] w-full rounded-xl" />
            <Skeleton className="h-[120px] w-full rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
}

function EntryCard({ entry, updateEntry, deleteEntry }: { entry: TimeEntry, updateEntry: any, deleteEntry: any }) {
  const isTime = entry.entry_type === 'time';

  return (
    <Card className="relative overflow-hidden border-border/60 shadow-sm transition-all hover:shadow-md hover:border-border bg-white group">
      {entry.__draft && <div className="absolute top-0 left-0 w-1 h-full bg-amber-400" />}
      <CardContent className="p-0">
        <div className="flex flex-col md:flex-row">
          <div className="flex-1 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
              <div className="space-y-1.5 flex-1 max-w-full">
                <Input 
                  value={entry.description || ''} 
                  onChange={e => updateEntry(entry.__id, 'description', e.target.value)} 
                  className="font-medium text-foreground h-auto py-1 px-2 -ml-2 border-transparent hover:border-border focus-visible:border-primary bg-transparent shadow-none"
                  placeholder="Description of work..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Date</Label>
                <Input type="date" value={entry.date || ''} onChange={e => updateEntry(entry.__id, 'date', e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Type</Label>
                <Select value={entry.entry_type} onValueChange={(v) => updateEntry(entry.__id, 'entry_type', v as EntryType)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="time">Time</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{isTime ? 'Hours' : 'Amount ($)'}</Label>
                {isTime ? (
                  <Input 
                    type="number" step="0.1" 
                    value={entry.predicted_time || ''} 
                    onChange={e => updateEntry(entry.__id, 'predicted_time', parseFloat(e.target.value))} 
                    className="h-8 text-sm font-medium" 
                  />
                ) : (
                  <Input 
                    type="number" step="0.01" 
                    value={entry.amount_charged || ''} 
                    onChange={e => updateEntry(entry.__id, 'amount_charged', parseFloat(e.target.value))} 
                    className="h-8 text-sm font-medium" 
                  />
                )}
              </div>
              {isTime && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Rate</Label>
                  <Input 
                    type="number" 
                    value={entry.billing_rate || ''} 
                    onChange={e => updateEntry(entry.__id, 'billing_rate', parseFloat(e.target.value))} 
                    className="h-8 text-sm" 
                  />
                </div>
              )}
            </div>

            {entry.documents && entry.documents.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {entry.documents.map((doc, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs font-normal max-w-xs truncate bg-slate-50 border-border/60 text-muted-foreground py-0.5 px-2">
                    <Mail className="w-3 h-3 mr-1.5 inline opacity-70" />
                    {doc.subject || 'Email Reference'}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-50 border-t md:border-t-0 md:border-l border-border/60 p-5 flex flex-row md:flex-col items-center justify-between min-w-[140px]">
            <div className="text-left md:text-right w-full">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Total</div>
              <div className="text-lg font-semibold text-foreground">{formatCurrency(entry.amount_charged || 0)}</div>
            </div>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 md:mt-auto opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity" onClick={() => deleteEntry(entry.__id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
