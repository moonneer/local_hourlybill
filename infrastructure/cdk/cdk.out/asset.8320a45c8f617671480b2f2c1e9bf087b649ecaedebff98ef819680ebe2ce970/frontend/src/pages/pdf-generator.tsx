import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatHours } from "@/lib/utils";
import { FileDown, RefreshCw, Save, Image as ImageIcon, Building, MapPin, Globe, Phone } from "lucide-react";

interface Inputs {
  user?: string;
  law_firm_phone?: string;
  law_firm_website?: string;
  law_firm_logo_path?: string;
  user_address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
}

export default function PdfPage() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const selectedQuery = searchParams.get("query") || "";
  const queryClient = useQueryClient();

  const [firmInfo, setFirmInfo] = useState<Inputs>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Queries
  const { data: queriesData } = useQuery<{ queries: string[] }>({ queryKey: ["/api/queries"] });
  const { data: inputsData, isLoading: isLoadingInputs } = useQuery<Inputs>({ queryKey: ["/api/inputs"] });
  
  const { data: timeEntriesData, isLoading: isLoadingEntries } = useQuery({
    queryKey: ["/api/time-entries", selectedQuery],
    queryFn: async () => {
      if (!selectedQuery) return null;
      const res = await apiRequest("GET", `/api/time-entries?query=${encodeURIComponent(selectedQuery)}`);
      return res.json();
    },
    enabled: !!selectedQuery,
  });

  useEffect(() => {
    if (inputsData) {
      setFirmInfo(inputsData);
      setHasUnsavedChanges(false);
    }
  }, [inputsData]);

  const handleQueryChange = (val: string) => {
    setLocation(`/pdf?query=${encodeURIComponent(val)}`);
  };

  const updateFirmInfo = (field: keyof Inputs, value: any) => {
    setFirmInfo(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const updateAddress = (field: keyof Required<Inputs>['user_address'], value: string) => {
    setFirmInfo(prev => ({
      ...prev,
      user_address: { ...(prev.user_address || {}), [field]: value }
    }));
    setHasUnsavedChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/inputs", firmInfo);
    },
    onSuccess: () => {
      toast({ title: "Saved successfully", description: "Firm information has been updated." });
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ["/api/inputs"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    }
  });

  const generatePdf = () => {
    if (!selectedQuery) return;
    window.open(`/api/generate-pdf?query=${encodeURIComponent(selectedQuery)}`, "_blank");
  };

  // Prepare invoice data
  const entries = timeEntriesData?.entries || [];
  const clientName = timeEntriesData?.client_name || "Client Name";
  
  const groupedEntries: Record<string, any[]> = {};
  let grandTotal = 0;

  entries.forEach((e: any) => {
    const m = e.matter || 'Uncategorized';
    if (!groupedEntries[m]) groupedEntries[m] = [];
    groupedEntries[m].push(e);
    grandTotal += (e.amount_charged || 0);
  });

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-500 pb-24">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Invoices</h1>
          <p className="text-muted-foreground mt-1">Generate professional PDF invoices for your clients.</p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={selectedQuery} onValueChange={handleQueryChange}>
            <SelectTrigger className="w-[280px] bg-white shadow-sm border-border/80 h-10">
              <SelectValue placeholder="Select a matter..." />
            </SelectTrigger>
            <SelectContent>
              {queriesData?.queries?.map(q => (
                <SelectItem key={q} value={q}>{q}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/time-entries", selectedQuery] })} disabled={!selectedQuery} className="h-10 w-10 shrink-0 bg-white">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </Button>
          <Button onClick={generatePdf} disabled={!selectedQuery || entries.length === 0} className="h-10 shadow-sm ml-2">
            <FileDown className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Firm Info Sidebar */}
        <div className="xl:col-span-4 space-y-6 sticky top-24">
          <Card className="border-border/60 shadow-sm bg-white overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-border/40 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building className="w-4 h-4 text-muted-foreground" />
                  Firm Details
                </CardTitle>
                <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!hasUnsavedChanges || saveMutation.isPending} className="h-8">
                  {saveMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                  Save
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-5">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Firm Name</Label>
                  <Input value={firmInfo.user || ''} onChange={e => updateFirmInfo('user', e.target.value)} className="h-9" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5"><Phone className="w-3 h-3" /> Phone</Label>
                    <Input value={firmInfo.law_firm_phone || ''} onChange={e => updateFirmInfo('law_firm_phone', e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5"><Globe className="w-3 h-3" /> Website</Label>
                    <Input value={firmInfo.law_firm_website || ''} onChange={e => updateFirmInfo('law_firm_website', e.target.value)} className="h-9" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Logo URL</Label>
                  <div className="flex gap-2">
                    <Input value={firmInfo.law_firm_logo_path || ''} onChange={e => updateFirmInfo('law_firm_logo_path', e.target.value)} placeholder="https://..." className="h-9" />
                    <Button variant="outline" size="icon" className="shrink-0 h-9 w-9"><ImageIcon className="w-4 h-4 text-muted-foreground" /></Button>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border/40">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5 mb-3"><MapPin className="w-3 h-3" /> Address</Label>
                <div className="space-y-3">
                  <Input value={firmInfo.user_address?.line1 || ''} onChange={e => updateAddress('line1', e.target.value)} placeholder="Street Address" className="h-9" />
                  <Input value={firmInfo.user_address?.line2 || ''} onChange={e => updateAddress('line2', e.target.value)} placeholder="Suite, Unit, etc." className="h-9" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input value={firmInfo.user_address?.city || ''} onChange={e => updateAddress('city', e.target.value)} placeholder="City" className="h-9" />
                    <Input value={firmInfo.user_address?.state || ''} onChange={e => updateAddress('state', e.target.value)} placeholder="State" className="h-9" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input value={firmInfo.user_address?.postal_code || ''} onChange={e => updateAddress('postal_code', e.target.value)} placeholder="ZIP / Postal" className="h-9" />
                    <Input value={firmInfo.user_address?.country || ''} onChange={e => updateAddress('country', e.target.value)} placeholder="Country" className="h-9" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Invoice Preview */}
        <div className="xl:col-span-8">
          {!selectedQuery ? (
            <div className="h-[600px] flex flex-col items-center justify-center border border-border/60 border-dashed rounded-2xl bg-white shadow-sm">
              <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4 border border-border/40">
                <FileText className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="text-lg font-medium text-foreground">No Invoice Selected</p>
              <p className="text-sm text-muted-foreground mt-1">Select a matter to preview the generated invoice.</p>
            </div>
          ) : isLoadingEntries || isLoadingInputs ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-1/3" />
              <Skeleton className="h-[800px] w-full rounded-2xl shadow-sm" />
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-border/40 overflow-hidden print:shadow-none print:border-none mx-auto max-w-[850px]">
              <div className="p-10 md:p-14 font-sans text-slate-800">
                {/* Header */}
                <div className="flex justify-between items-start mb-12">
                  <div className="max-w-[50%]">
                    {firmInfo.law_firm_logo_path ? (
                      <img src={firmInfo.law_firm_logo_path} alt="Logo" className="h-14 mb-4 object-contain" />
                    ) : (
                      <h1 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">{firmInfo.user || "Your Firm Name"}</h1>
                    )}
                    <div className="text-[13px] leading-relaxed text-slate-500">
                      {firmInfo.user_address?.line1 && <div>{firmInfo.user_address.line1}</div>}
                      {firmInfo.user_address?.line2 && <div>{firmInfo.user_address.line2}</div>}
                      {(firmInfo.user_address?.city || firmInfo.user_address?.state) && (
                        <div>{firmInfo.user_address?.city}, {firmInfo.user_address?.state} {firmInfo.user_address?.postal_code}</div>
                      )}
                      <div className="mt-2 space-y-0.5">
                        {firmInfo.law_firm_phone && <div>{firmInfo.law_firm_phone}</div>}
                        {firmInfo.law_firm_website && <div>{firmInfo.law_firm_website}</div>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-4xl font-light text-slate-300 tracking-widest mb-6 uppercase">Invoice</h2>
                    <div className="text-[13px] text-slate-600 grid grid-cols-2 gap-x-4 gap-y-2 text-right justify-end ml-auto max-w-[200px]">
                      <div className="font-semibold text-slate-400 uppercase tracking-wider text-[11px] self-center">Date</div>
                      <div className="font-medium text-slate-800">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                      <div className="font-semibold text-slate-400 uppercase tracking-wider text-[11px] self-center">Invoice #</div>
                      <div className="font-medium text-slate-800">INV-{Math.floor(Math.random() * 10000).toString().padStart(4, '0')}</div>
                    </div>
                  </div>
                </div>

                {/* Bill To */}
                <div className="mb-12 bg-slate-50 p-6 rounded-lg border border-slate-100">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Bill To</h3>
                  <div className="text-lg font-semibold text-slate-900">{clientName}</div>
                  <div className="text-sm text-slate-500 mt-1">Matter: {selectedQuery}</div>
                </div>

                {/* Entries */}
                <div className="space-y-10">
                  {Object.entries(groupedEntries).sort(([a], [b]) => a.localeCompare(b)).map(([matter, matterEntries]) => {
                    const matterTotal = matterEntries.reduce((sum, e) => sum + (e.amount_charged || 0), 0);
                    return (
                      <div key={matter} className="space-y-4">
                        <h4 className="text-sm font-bold text-slate-800 border-b-2 border-slate-200 pb-2">{matter}</h4>
                        <table className="w-full text-[13px]">
                          <thead>
                            <tr className="text-left text-slate-500 border-b border-slate-100">
                              <th className="py-3 font-semibold w-[15%]">Date</th>
                              <th className="py-3 font-semibold w-[45%]">Description</th>
                              <th className="py-3 font-semibold text-right w-[10%]">Hours</th>
                              <th className="py-3 font-semibold text-right w-[15%]">Rate</th>
                              <th className="py-3 font-semibold text-right w-[15%]">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {matterEntries.sort((a,b) => (a.date || "").localeCompare(b.date || "")).map((entry, idx) => (
                              <tr key={idx} className="text-slate-600 hover:bg-slate-50/50 transition-colors">
                                <td className="py-4 align-top whitespace-nowrap">{entry.date}</td>
                                <td className="py-4 align-top pr-6 leading-relaxed">{entry.description}</td>
                                <td className="py-4 align-top text-right">{entry.entry_type === 'time' ? (entry.predicted_time || 0).toFixed(1) : '-'}</td>
                                <td className="py-4 align-top text-right">{entry.entry_type === 'time' ? formatCurrency(entry.billing_rate || 0) : '-'}</td>
                                <td className="py-4 align-top text-right font-medium text-slate-800">{formatCurrency(entry.amount_charged || 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-slate-200 bg-slate-50/50">
                              <td colSpan={4} className="py-3 px-4 text-right font-semibold text-slate-500 text-[11px] uppercase tracking-wider">Matter Subtotal</td>
                              <td className="py-3 text-right font-bold text-slate-900">{formatCurrency(matterTotal)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })}
                </div>

                {/* Grand Total */}
                <div className="flex justify-end pt-8 mt-12 border-t-2 border-slate-800">
                  <div className="w-[300px]">
                    <div className="flex justify-between items-center text-2xl font-bold text-slate-900 bg-slate-50 p-4 rounded-lg">
                      <span>Total Due</span>
                      <span className="text-primary">{formatCurrency(grandTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-20 pt-8 border-t border-slate-200 text-center space-y-2">
                  <p className="text-[13px] font-medium text-slate-800">Please make all checks payable to {firmInfo.user || "Our Firm"}.</p>
                  <p className="text-[12px] text-slate-500">Thank you for your business.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Add FileText import if not present above
import { FileText } from "lucide-react";
