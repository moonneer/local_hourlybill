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
import { Save, RefreshCw, FileText, Plus, Upload, Trash2, Mail } from "lucide-react";

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
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/50 p-4 rounded-xl border border-border/50 backdrop-blur">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select value={selectedQuery} onValueChange={handleQueryChange}>
            <SelectTrigger className="w-[280px] bg-background">
              <SelectValue placeholder="Select a matter to edit" />
            </SelectTrigger>
            <SelectContent>
              {queriesData?.queries?.map(q => (
                <SelectItem key={q} value={q}>{q}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/time-entries", selectedQuery] })} disabled={!selectedQuery}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {hasUnsavedChanges && <span className="text-sm text-amber-500 font-medium px-2">Unsaved changes</span>}
          <Button variant="secondary" onClick={() => setLocation(`/pdf?query=${selectedQuery}`)} disabled={!selectedQuery}>
            <FileText className="w-4 h-4 mr-2" />
            PDF
          </Button>
          <Button onClick={handleSave} disabled={!selectedQuery || saveMutation.isPending} className="min-w-[120px]">
            {saveMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>

      {entriesError && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg">
          Failed to load entries: {(entriesError as Error).message}
        </div>
      )}

      {selectedQuery && !isLoadingEntries && (
        <>
          {/* Bill Info */}
          <Card className="border-border/50 shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/10 pb-4">
              <CardTitle className="text-lg">Bill Information</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <Label>Client Name</Label>
                  <Input value={billInfo.client_name} onChange={e => updateBillInfo('client_name', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>User Name</Label>
                  <Input value={billInfo.user_name} onChange={e => updateBillInfo('user_name', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Billing Rate ($/hr)</Label>
                  <Input type="number" value={billInfo.billing_rate} onChange={e => updateBillInfo('billing_rate', parseFloat(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input value={billInfo.timezone} onChange={e => updateBillInfo('timezone', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-3">
            <Button onClick={addEntry} className="shadow-sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Entry
            </Button>
            <Button variant="outline" className="shadow-sm">
              <Upload className="w-4 h-4 mr-2" />
              Import Bill4Time
            </Button>
          </div>

          {/* Entries */}
          <div className="space-y-8">
            {groupedEntries.unsaved.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-amber-500 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  New / Unsaved
                </h3>
                <div className="grid gap-4">
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
                  <div className="flex items-end justify-between border-b border-border/50 pb-2">
                    <h3 className="text-xl font-semibold text-primary">{matter}</h3>
                    <div className="text-sm text-muted-foreground font-medium">
                      {formatHours(totalHours)} • {formatCurrency(totalAmount)}
                    </div>
                  </div>
                  <div className="grid gap-4">
                    {matterEntries.map(entry => (
                      <EntryCard key={entry.__id} entry={entry} updateEntry={updateEntry} deleteEntry={deleteEntry} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {isLoadingEntries && (
        <div className="space-y-6">
          <Skeleton className="h-[200px] w-full rounded-xl" />
          <Skeleton className="h-[150px] w-full rounded-xl" />
          <Skeleton className="h-[150px] w-full rounded-xl" />
        </div>
      )}
    </div>
  );
}

function EntryCard({ entry, updateEntry, deleteEntry }: { entry: TimeEntry, updateEntry: any, deleteEntry: any }) {
  const isTime = entry.entry_type === 'time';

  return (
    <Card className="relative overflow-hidden border-border/50 transition-all hover:border-primary/30">
      {entry.__draft && <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />}
      <CardContent className="p-5">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Matter</Label>
                <Input value={entry.matter || ''} onChange={e => updateEntry(entry.__id, 'matter', e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Date</Label>
                <Input type="date" value={entry.date || ''} onChange={e => updateEntry(entry.__id, 'date', e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <div className="flex items-center gap-2 h-9">
                  <span className={`text-xs ${isTime ? 'text-foreground' : 'text-muted-foreground'}`}>Time</span>
                  <Switch 
                    checked={!isTime} 
                    onCheckedChange={(c) => updateEntry(entry.__id, 'entry_type', c ? 'expense' : 'time')} 
                  />
                  <span className={`text-xs ${!isTime ? 'text-foreground' : 'text-muted-foreground'}`}>Expense</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{isTime ? 'Hours' : 'Amount ($)'}</Label>
                {isTime ? (
                  <Input 
                    type="number" step="0.1" 
                    value={entry.predicted_time || ''} 
                    onChange={e => updateEntry(entry.__id, 'predicted_time', parseFloat(e.target.value))} 
                    className="h-9" 
                  />
                ) : (
                  <Input 
                    type="number" step="0.01" 
                    value={entry.amount_charged || ''} 
                    onChange={e => updateEntry(entry.__id, 'amount_charged', parseFloat(e.target.value))} 
                    className="h-9" 
                  />
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea 
                value={entry.description || ''} 
                onChange={e => updateEntry(entry.__id, 'description', e.target.value)} 
                className="min-h-[80px] resize-y text-sm"
              />
            </div>

            {entry.documents && entry.documents.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {entry.documents.map((doc, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs font-normal max-w-xs truncate bg-secondary/50">
                    <Mail className="w-3 h-3 mr-1 inline" />
                    {doc.subject || 'Email'}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex md:flex-col items-center justify-between md:justify-start gap-4 md:w-32 border-t md:border-t-0 md:border-l border-border/50 pt-4 md:pt-0 md:pl-6">
            <div className="text-right w-full">
              <div className="text-xs text-muted-foreground mb-1">Total</div>
              <div className="text-lg font-semibold text-primary">{formatCurrency(entry.amount_charged || 0)}</div>
              {isTime && <div className="text-xs text-muted-foreground mt-1">@ {formatCurrency(entry.billing_rate || 0)}/hr</div>}
            </div>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive shrink-0 md:mt-auto" onClick={() => deleteEntry(entry.__id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
