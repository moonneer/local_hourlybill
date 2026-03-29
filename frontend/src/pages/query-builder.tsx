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
import { Play, Plus, Save, FileEdit, Trash2, StopCircle } from "lucide-react";

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

  // Queries
  const { data: queriesData } = useQuery<{ queries: string[] }>({ queryKey: ["/api/queries"] });
  const { data: inputsData } = useQuery<{ user?: string }>({ queryKey: ["/api/inputs"] });
  const { data: queryJsonData, isLoading: isLoadingQueries } = useQuery<Record<string, QueryEntry>>({ queryKey: ["/api/query-json"] });

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
    setPipelineStep({ step: 0, total: 0, name: "Initializing..." });

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
    <div className="max-w-5xl mx-auto p-6 space-y-8 pb-20">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/50 p-4 rounded-xl border border-border/50 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select value={isNew ? "" : selectedQuery} onValueChange={handleQueryChange}>
            <SelectTrigger className="w-[280px] bg-background">
              <SelectValue placeholder="Select a matter to edit" />
            </SelectTrigger>
            <SelectContent>
              {queriesData?.queries?.map(q => (
                <SelectItem key={q} value={q}>{q}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleNew}>
            <Plus className="w-4 h-4 mr-2" />
            New
          </Button>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {selectedQuery && !isNew && (
            <>
              <Button variant="secondary" onClick={() => setLocation(`/?query=${encodeURIComponent(queryName)}`)}>
                <FileEdit className="w-4 h-4 mr-2" />
                Edit Entries
              </Button>
              {pipelineState === "running" ? (
                <Button variant="destructive" onClick={stopPipeline}>
                  <StopCircle className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              ) : (
                <Button variant="default" className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={runPipeline}>
                  <Play className="w-4 h-4 mr-2" />
                  Run Analysis
                </Button>
              )}
            </>
          )}
          <Button onClick={() => saveMutation.mutate()} disabled={!queryName || saveMutation.isPending}>
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      {isLoadingQueries ? (
        <div className="space-y-6">
          <Skeleton className="h-[200px] w-full rounded-xl" />
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-8">
          {/* Main Info */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/10 pb-4">
              <CardTitle>Matter Details</CardTitle>
              <CardDescription>Basic information for this billing matter</CardDescription>
            </CardHeader>
            <CardContent className="p-6 grid gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Matter Name</Label>
                  <Input 
                    value={queryName} 
                    onChange={e => setQueryName(e.target.value)} 
                    placeholder="e.g. Acme Corp Aug 2023"
                    disabled={!isNew}
                    className={!isNew ? "bg-muted/50" : ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label>User (Your Name)</Label>
                  <Input 
                    value={formData.user || ''} 
                    onChange={e => updateForm('user', e.target.value)} 
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client Name</Label>
                  <Input 
                    value={formData.client_name || ''} 
                    onChange={e => updateForm('client_name', e.target.value)} 
                    placeholder="Acme Corp"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Billing Rate ($/hr)</Label>
                  <Input 
                    type="number" 
                    value={formData.billing_rate || ''} 
                    onChange={e => updateForm('billing_rate', parseFloat(e.target.value))} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input 
                    type="date" 
                    value={formData.start_date || ''} 
                    onChange={e => updateForm('start_date', e.target.value)} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input 
                    type="date" 
                    value={formData.end_date || ''} 
                    onChange={e => updateForm('end_date', e.target.value)} 
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Search Parameters */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/10 pb-4">
              <CardTitle>Search Parameters</CardTitle>
              <CardDescription>Global search filters applied to all emails</CardDescription>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label>Target Emails (one per line)</Label>
                <Textarea 
                  value={joinLines(formData.emails)} 
                  onChange={e => updateForm('emails', splitLines(e.target.value))} 
                  className="min-h-[150px] font-mono text-sm"
                  placeholder="client@acme.com&#10;partner@acme.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Keywords (one per line)</Label>
                <Textarea 
                  value={joinLines(formData.keywords)} 
                  onChange={e => updateForm('keywords', splitLines(e.target.value))} 
                  className="min-h-[150px] font-mono text-sm"
                  placeholder="Acme&#10;Project X"
                />
              </div>
              <div className="space-y-2">
                <Label>Exclude Keywords</Label>
                <Textarea 
                  value={joinLines(formData.exclude_keywords)} 
                  onChange={e => updateForm('exclude_keywords', splitLines(e.target.value))} 
                  className="min-h-[150px] font-mono text-sm"
                  placeholder="newsletter&#10;unsubscribe"
                />
              </div>
            </CardContent>
          </Card>

          {/* Matters */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/10 pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle>Matters</CardTitle>
                <CardDescription>Categorize entries using specific keywords</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={addMatter}>
                <Plus className="w-4 h-4 mr-2" /> Add Matter
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(formData.matters || {}).map(([matterName, matterData], idx) => (
                  <Card key={idx} className="bg-muted/5 border-border/50">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1.5 flex-1">
                          <Label className="text-xs">Matter Name</Label>
                          <Input 
                            value={matterName} 
                            onChange={e => updateMatter(matterName, e.target.value, joinLines(matterData.keywords))}
                            className="h-8 font-medium"
                          />
                        </div>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive shrink-0 mt-6" onClick={() => deleteMatter(matterName)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Keywords (one per line)</Label>
                        <Textarea 
                          value={joinLines(matterData.keywords)} 
                          onChange={e => updateMatter(matterName, matterName, e.target.value)}
                          className="min-h-[100px] font-mono text-xs"
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {Object.keys(formData.matters || {}).length === 0 && (
                  <div className="col-span-full py-8 text-center text-muted-foreground border-2 border-dashed border-border/50 rounded-xl">
                    No matters defined. Add a matter to start categorizing entries.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pipeline Log */}
          {(pipelineState !== "idle" || pipelineLogs.length > 0) && (
            <Card className="border-primary/20 shadow-md">
              <CardHeader className="bg-primary/5 pb-4 border-b border-primary/10">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    Email Analysis Progress
                    {pipelineState === "running" && <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span></span>}
                  </CardTitle>
                  {pipelineState === "complete" && <span className="text-sm text-emerald-500 font-medium">Completed Successfully</span>}
                  {pipelineState === "error" && <span className="text-sm text-destructive font-medium">Execution Failed</span>}
                </div>
                {pipelineStep.total > 0 && (
                  <CardDescription>
                    Step {pipelineStep.step} of {pipelineStep.total}: {pipelineStep.name}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <div className="bg-[#0a0a0a] text-[#00ff00] p-4 font-mono text-xs md:text-sm h-[300px] overflow-y-auto w-full">
                  {pipelineLogs.map((log, idx) => (
                    <div key={idx} className={`${log.stream === 'stderr' ? 'text-red-400' : ''} whitespace-pre-wrap break-words mb-1`}>
                      {log.text}
                    </div>
                  ))}
                  {pipelineLogs.length === 0 && pipelineState === "running" && (
                    <div className="text-muted-foreground animate-pulse">Connecting to analysis engine...</div>
                  )}
                  <div ref={(el) => { if (el) el.scrollIntoView({ behavior: "smooth" }) }} />
                </div>
              </CardContent>
              {pipelineState === "complete" && (
                <div className="p-4 bg-primary/5 border-t border-primary/10 flex justify-end">
                  <Button onClick={() => setLocation(`/?query=${encodeURIComponent(queryName)}`)}>
                    <FileEdit className="w-4 h-4 mr-2" />
                    Review Entries
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
