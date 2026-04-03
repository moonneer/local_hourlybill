import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { Play, Plus, Save, FileEdit, Trash2, StopCircle, ArrowRight, Activity, Calendar, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

interface QueryEntry {
  user?: string;
  client_name?: string;
  billing_rate?: number;
  start_date?: string;
  end_date?: string;
  emails?: string[];
  keywords?: string[];
  exclude_keywords?: string[];
  matters?: Record<string, { keywords?: string[] }>;
}

export default function QueryBuilderPage() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const selectedQuery = searchParams.get("query") || "";
  const queryClient = useQueryClient();

  // State
  const [isNew, setIsNew] = useState(false);
  const [queryName, setQueryName] = useState("");
  const [formData, setFormData] = useState<QueryEntry>({});
  
  // Pipeline State
  const [pipelineState, setPipelineState] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [pipelineLogs, setPipelineLogs] = useState<{stream: string, text: string}[]>([]);
  const [pipelineStep, setPipelineStep] = useState({ step: 0, total: 0, name: "" });
  const eventSourceRef = useRef<EventSource | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Queries
  const { data: queriesData } = useQuery<{ queries: string[] }>({ queryKey: ["/api/queries"] });
  const { data: inputsData } = useQuery<{ user?: string }>({ queryKey: ["/api/inputs"] });
  const { data: queryJsonData, isLoading: isLoadingQueries } = useQuery<Record<string, QueryEntry>>({ queryKey: ["/api/query-json"] });

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [pipelineLogs]);

  // Update form when selection changes
  useEffect(() => {
    if (selectedQuery && queryJsonData && queryJsonData[selectedQuery]) {
      setFormData(queryJsonData[selectedQuery]);
      setQueryName(selectedQuery);
      setIsNew(false);
    } else if (!isNew && !selectedQuery) {
      setFormData({
        user: inputsData?.user || "",
        matters: {}
      });
      setQueryName("");
    }
  }, [selectedQuery, queryJsonData, isNew, inputsData]);

  const handleQueryChange = (val: string) => {
    setIsNew(false);
    setLocation(`/query?query=${encodeURIComponent(val)}`);
  };

  const handleNew = () => {
    setIsNew(true);
    setQueryName("");
    setFormData({
      user: inputsData?.user || "",
      client_name: "",
      billing_rate: 0,
      start_date: "",
      end_date: "",
      emails: [],
      keywords: [],
      exclude_keywords: [],
      matters: {}
    });
    setLocation("/query");
  };

  const saveInputsMutation = useMutation({
    mutationFn: async (user: string) => {
      await apiRequest("POST", "/api/inputs", { user });
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (formData.user && formData.user !== inputsData?.user) {
        await saveInputsMutation.mutateAsync(formData.user);
      }
      const res = await apiRequest("POST", "/api/query-entry", {
        query_name: queryName,
        entry: formData,
        is_new: isNew
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved successfully", description: "Matter has been saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/queries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/query-json"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inputs"] });
      setIsNew(false);
      setLocation(`/query?query=${encodeURIComponent(queryName)}`);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    }
  });

  const runPipeline = () => {
    if (pipelineState === "running") return;
    setPipelineState("running");
    setPipelineLogs([]);
    setPipelineStep({ step: 0, total: 0, name: "Initializing analysis engine..." });

    const url = `/api/run-pipeline?query=${encodeURIComponent(queryName)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "start") {
          // started
        } else if (parsed.type === "step_start") {
          setPipelineStep({ step: parsed.data.step, total: parsed.data.total, name: parsed.data.name });
        } else if (parsed.type === "log") {
          setPipelineLogs(prev => [...prev, { stream: parsed.data.stream, text: parsed.data.text }]);
        } else if (parsed.type === "complete") {
          es.close();
          setPipelineState(parsed.data.success ? "complete" : "error");
          if (parsed.data.success) {
            toast({ title: "Analysis complete", description: "Time entries are ready to review." });
          } else {
            toast({ title: "Analysis failed", description: parsed.data.error || "Unknown error", variant: "destructive" });
          }
        }
      } catch (err) {
        console.error("Failed to parse SSE", err);
      }
    };

    es.onerror = (err) => {
      es.close();
      setPipelineState("error");
      toast({ title: "Connection lost", description: "Could not reach the analysis server.", variant: "destructive" });
    };
  };

  const stopPipeline = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setPipelineState("error");
    setPipelineLogs(prev => [...prev, { stream: "stderr", text: "Analysis stopped by user." }]);
  };

  const updateForm = (field: keyof QueryEntry, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateMatter = (oldName: string, newName: string, keywords: string) => {
    setFormData(prev => {
      const matters = { ...(prev.matters || {}) };
      const data = matters[oldName] || { keywords: [] };
      if (oldName !== newName) {
        delete matters[oldName];
      }
      matters[newName] = { keywords: keywords.split('\n').filter(k => k.trim() !== '') };
      return { ...prev, matters };
    });
  };

  const deleteMatter = (name: string) => {
    setFormData(prev => {
      const matters = { ...(prev.matters || {}) };
      delete matters[name];
      return { ...prev, matters };
    });
  };

  const addMatter = () => {
    let name = "New Matter";
    let i = 1;
    const matters = formData.matters || {};
    while (matters[name]) {
      name = `New Matter ${i}`;
      i++;
    }
    setFormData(prev => ({
      ...prev,
      matters: { ...matters, [name]: { keywords: [] } }
    }));
  };

  const joinLines = (arr?: string[]) => (arr || []).join('\n');
  const splitLines = (str: string) => str.split('\n').filter(s => s.trim() !== '');

  return (
    <div className="max-w-[1000px] mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-500 pb-24">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Matters</h1>
          <p className="text-muted-foreground mt-1">Configure email analysis and matter details.</p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={isNew ? "" : selectedQuery} onValueChange={handleQueryChange}>
            <SelectTrigger className="w-[260px] bg-white shadow-sm border-border/80 h-10">
              <SelectValue placeholder="Select a matter..." />
            </SelectTrigger>
            <SelectContent>
              {queriesData?.queries?.map(q => (
                <SelectItem key={q} value={q}>{q}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleNew} className="h-10 bg-white">
            <Plus className="w-4 h-4 mr-2" />
            New
          </Button>
        </div>
      </div>

      {/* Main Action Bar - Sticky */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-border/60 flex flex-col sm:flex-row items-center justify-between gap-4 sticky top-4 z-20 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="flex items-center gap-2 text-sm font-medium">
          {queryName ? (
            <><Tag className="w-4 h-4 text-muted-foreground" /> {queryName}</>
          ) : (
            <span className="text-muted-foreground">Editing New Matter</span>
          )}
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {selectedQuery && !isNew && (
            <>
              <Button variant="outline" onClick={() => setLocation(`/?query=${encodeURIComponent(queryName)}`)} className="bg-transparent">
                <FileEdit className="w-4 h-4 mr-2 text-muted-foreground" />
                View Entries
              </Button>
              {pipelineState === "running" ? (
                <Button variant="destructive" onClick={stopPipeline} className="shadow-sm">
                  <StopCircle className="w-4 h-4 mr-2 animate-pulse" />
                  Stop Analysis
                </Button>
              ) : (
                <Button variant="default" className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm px-6" onClick={runPipeline}>
                  <Play className="w-4 h-4 mr-2" />
                  Run AI Analysis
                </Button>
              )}
            </>
          )}
          <Button onClick={() => saveMutation.mutate()} disabled={!queryName || saveMutation.isPending} variant={isNew ? "default" : "secondary"} className="shadow-sm min-w-[100px]">
            {saveMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>

      {isLoadingQueries ? (
        <div className="space-y-6">
          <Skeleton className="h-[200px] w-full rounded-2xl" />
          <Skeleton className="h-[300px] w-full rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-6">
          {/* Main Info */}
          <Card className="border-border/60 shadow-sm overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-border/40 pb-4">
              <CardTitle className="text-lg">Matter Details</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Matter Name</Label>
                  <Input 
                    value={queryName} 
                    onChange={e => setQueryName(e.target.value)} 
                    placeholder="e.g. Acme Corp Aug 2023"
                    disabled={!isNew}
                    className={cn("h-10", !isNew && "bg-slate-50 text-muted-foreground")}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Client Name</Label>
                  <Input 
                    value={formData.client_name || ''} 
                    onChange={e => updateForm('client_name', e.target.value)} 
                    placeholder="Acme Corp"
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Professional (Your Name)</Label>
                  <Input 
                    value={formData.user || ''} 
                    onChange={e => updateForm('user', e.target.value)} 
                    placeholder="Jane Doe"
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Billing Rate ($/hr)</Label>
                  <Input 
                    type="number" 
                    value={formData.billing_rate || ''} 
                    onChange={e => updateForm('billing_rate', parseFloat(e.target.value))} 
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Start Date</Label>
                  <Input 
                    type="date" 
                    value={formData.start_date || ''} 
                    onChange={e => updateForm('start_date', e.target.value)} 
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5"><Calendar className="w-3 h-3" /> End Date</Label>
                  <Input 
                    type="date" 
                    value={formData.end_date || ''} 
                    onChange={e => updateForm('end_date', e.target.value)} 
                    className="h-10"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Search Parameters */}
          <Card className="border-border/60 shadow-sm overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-border/40 pb-4">
              <CardTitle className="text-lg">AI Search Filters</CardTitle>
              <CardDescription>Global filters applied to locate relevant emails</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Target Emails</Label>
                  <div className="text-[11px] text-muted-foreground mb-1">One address per line</div>
                  <Textarea 
                    value={joinLines(formData.emails)} 
                    onChange={e => updateForm('emails', splitLines(e.target.value))} 
                    className="min-h-[120px] font-mono text-xs resize-y bg-slate-50/50"
                    placeholder="client@acme.com&#10;partner@acme.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Include Keywords</Label>
                  <div className="text-[11px] text-muted-foreground mb-1">Required in subject/body</div>
                  <Textarea 
                    value={joinLines(formData.keywords)} 
                    onChange={e => updateForm('keywords', splitLines(e.target.value))} 
                    className="min-h-[120px] font-mono text-xs resize-y bg-slate-50/50"
                    placeholder="Acme&#10;Project X"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Exclude Keywords</Label>
                  <div className="text-[11px] text-muted-foreground mb-1">Skip emails containing these</div>
                  <Textarea 
                    value={joinLines(formData.exclude_keywords)} 
                    onChange={e => updateForm('exclude_keywords', splitLines(e.target.value))} 
                    className="min-h-[120px] font-mono text-xs resize-y bg-slate-50/50"
                    placeholder="newsletter&#10;unsubscribe"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Matters */}
          <Card className="border-border/60 shadow-sm overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-border/40 pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Sub-Matters / Categories</CardTitle>
                <CardDescription>Group time entries automatically based on keywords</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={addMatter} className="bg-white">
                <Plus className="w-4 h-4 mr-2" /> Add Category
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(formData.matters || {}).map(([matterName, matterData], idx) => (
                  <div key={idx} className="bg-slate-50 border border-border/60 rounded-xl overflow-hidden group">
                    <div className="p-3 border-b border-border/40 flex items-center justify-between bg-white">
                      <Input 
                        value={matterName} 
                        onChange={e => updateMatter(matterName, e.target.value, joinLines(matterData.keywords))}
                        className="h-8 font-semibold border-transparent hover:border-border px-2 py-1 -ml-2 shadow-none focus-visible:ring-1"
                      />
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteMatter(matterName)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="p-3">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-2">Routing Keywords</Label>
                      <Textarea 
                        value={joinLines(matterData.keywords)} 
                        onChange={e => updateMatter(matterName, matterName, e.target.value)}
                        className="min-h-[80px] font-mono text-xs border-border/40 shadow-none"
                        placeholder="keyword1&#10;keyword2"
                      />
                    </div>
                  </div>
                ))}
                {Object.keys(formData.matters || {}).length === 0 && (
                  <div className="col-span-full py-10 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border/60 rounded-xl bg-slate-50/50">
                    <Tag className="w-8 h-8 text-muted-foreground/40 mb-3" />
                    <p className="font-medium text-sm">No categories defined</p>
                    <p className="text-xs max-w-sm text-center mt-1">Add categories to automatically group your time entries based on email content.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pipeline Log */}
          {(pipelineState !== "idle" || pipelineLogs.length > 0) && (
            <Card className="border-primary/20 shadow-md overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
              <CardHeader className={cn("pb-4 border-b transition-colors", 
                pipelineState === "running" ? "bg-primary/5 border-primary/20" :
                pipelineState === "complete" ? "bg-emerald-500/5 border-emerald-500/20" :
                "bg-destructive/5 border-destructive/20"
              )}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Analysis Progress
                    {pipelineState === "running" && <span className="relative flex h-2.5 w-2.5 ml-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span></span>}
                  </CardTitle>
                  {pipelineState === "complete" && <span className="text-sm text-emerald-600 font-semibold px-2 py-1 bg-emerald-100 rounded-md">Completed</span>}
                  {pipelineState === "error" && <span className="text-sm text-destructive font-semibold px-2 py-1 bg-destructive/10 rounded-md">Failed</span>}
                </div>
                {pipelineStep.total > 0 && pipelineState === "running" && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs font-medium mb-1 text-muted-foreground">
                      <span>{pipelineStep.name}</span>
                      <span>Step {pipelineStep.step} of {pipelineStep.total}</span>
                    </div>
                    <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: `${(pipelineStep.step / pipelineStep.total) * 100}%` }} />
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <div ref={logContainerRef} className="bg-[#0f111a] text-[#a5d6ff] p-4 font-mono text-[13px] leading-relaxed h-[320px] overflow-y-auto w-full selection:bg-primary/30">
                  {pipelineLogs.map((log, idx) => (
                    <div key={idx} className={cn("whitespace-pre-wrap break-words mb-1.5", log.stream === 'stderr' && "text-[#ff7b72]")}>
                      <span className="opacity-40 mr-3 text-[11px]">{new Date().toLocaleTimeString([], {hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
                      {log.text}
                    </div>
                  ))}
                  {pipelineLogs.length === 0 && pipelineState === "running" && (
                    <div className="text-[#a5d6ff]/50 animate-pulse flex items-center">
                      <div className="w-1.5 h-3 bg-[#a5d6ff]/50 mr-2 animate-pulse" /> Connecting to engine...
                    </div>
                  )}
                  {pipelineState === "running" && pipelineLogs.length > 0 && (
                    <div className="w-1.5 h-3 bg-[#a5d6ff] mt-2 animate-pulse" />
                  )}
                </div>
              </CardContent>
              {pipelineState === "complete" && (
                <div className="p-4 bg-emerald-500/5 border-t border-emerald-500/10 flex justify-end">
                  <Button onClick={() => setLocation(`/?query=${encodeURIComponent(queryName)}`)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    Review Entries <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
