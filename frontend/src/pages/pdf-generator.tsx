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
import { FileDown, RefreshCw, Save, Image as ImageIcon } from "lucide-react";

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
  const clientName = timeEntriesData?.client_name || "Unknown Client";
  
  const groupedEntries: Record<string, any[]> = {};
  let grandTotal = 0;

  entries.forEach((e: any) => {
    const m = e.matter || 'Uncategorized';
    if (!groupedEntries[m]) groupedEntries[m] = [];
    groupedEntries[m].push(e);
    grandTotal += (e.amount_charged || 0);
  });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 pb-20">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/50 p-4 rounded-xl border border-border/50 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select value={selectedQuery} onValueChange={handleQueryChange}>
            <SelectTrigger className="w-[280px] bg-background">
              <SelectValue placeholder="Select a matter to generate invoice" />
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
          <Button onClick={generatePdf} disabled={!selectedQuery || entries.length === 0} className="min-w-[150px]">
            <FileDown className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Firm Info Sidebar */}
        <div className="space-y-6">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="bg-muted/10 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Firm Information</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => saveMutation.mutate()} disabled={!hasUnsavedChanges || saveMutation.isPending}>
                  {saveMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </Button>
              </div>
              <CardDescription>Details appearing on the invoice header</CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-2">
                <Label>User / Firm Name</Label>
                <Input value={firmInfo.user || ''} onChange={e => updateFirmInfo('user', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={firmInfo.law_firm_phone || ''} onChange={e => updateFirmInfo('law_firm_phone', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input value={firmInfo.law_firm_website || ''} onChange={e => updateFirmInfo('law_firm_website', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Logo Path / URL</Label>
                <div className="flex gap-2">
                  <Input value={firmInfo.law_firm_logo_path || ''} onChange={e => updateFirmInfo('law_firm_logo_path', e.target.value)} placeholder="/assets/logo.png" />
                  <Button variant="outline" size="icon" className="shrink-0"><ImageIcon className="w-4 h-4" /></Button>
                </div>
              </div>

              <Separator className="my-4" />
              <Label className="text-muted-foreground font-semibold uppercase text-xs tracking-wider">Address</Label>
              
              <div className="space-y-3 pt-2">
                <Input value={firmInfo.user_address?.line1 || ''} onChange={e => updateAddress('line1', e.target.value)} placeholder="Line 1" />
                <Input value={firmInfo.user_address?.line2 || ''} onChange={e => updateAddress('line2', e.target.value)} placeholder="Line 2" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={firmInfo.user_address?.city || ''} onChange={e => updateAddress('city', e.target.value)} placeholder="City" />
                  <Input value={firmInfo.user_address?.state || ''} onChange={e => updateAddress('state', e.target.value)} placeholder="State" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={firmInfo.user_address?.postal_code || ''} onChange={e => updateAddress('postal_code', e.target.value)} placeholder="Postal Code" />
                  <Input value={firmInfo.user_address?.country || ''} onChange={e => updateAddress('country', e.target.value)} placeholder="Country" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Invoice Preview */}
        <div className="lg:col-span-2">
          {!selectedQuery ? (
            <div className="h-[600px] flex items-center justify-center border-2 border-dashed border-border/50 rounded-xl bg-card/20 text-muted-foreground">
              Select a matter to preview the invoice
            </div>
          ) : isLoadingEntries || isLoadingInputs ? (
            <Skeleton className="h-[800px] w-full rounded-xl" />
          ) : (
            <Card className="bg-white text-black overflow-hidden shadow-lg border-none rounded-xl">
              <div className="p-8 md:p-12 space-y-8 font-sans">
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div>
                    {firmInfo.law_firm_logo_path ? (
                      <img src={firmInfo.law_firm_logo_path} alt="Logo" className="h-12 mb-4 object-contain" />
                    ) : (
                      <h1 className="text-3xl font-bold text-gray-900 mb-4">{firmInfo.user || "Your Firm Name"}</h1>
                    )}
                    <div className="text-sm text-gray-600 space-y-1">
                      {firmInfo.user_address?.line1 && <div>{firmInfo.user_address.line1}</div>}
                      {firmInfo.user_address?.line2 && <div>{firmInfo.user_address.line2}</div>}
                      {(firmInfo.user_address?.city || firmInfo.user_address?.state) && (
                        <div>{firmInfo.user_address?.city}, {firmInfo.user_address?.state} {firmInfo.user_address?.postal_code}</div>
                      )}
                      {firmInfo.law_firm_phone && <div>{firmInfo.law_firm_phone}</div>}
                      {firmInfo.law_firm_website && <div>{firmInfo.law_firm_website}</div>}
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-4xl font-light text-gray-400 tracking-widest mb-4">INVOICE</h2>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div className="flex justify-end gap-4"><span className="font-semibold text-gray-800">Date:</span> {new Date().toLocaleDateString()}</div>
                      <div className="flex justify-end gap-4"><span className="font-semibold text-gray-800">Invoice #:</span> INV-{Math.floor(Math.random() * 10000)}</div>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-gray-200 my-8" />

                {/* Bill To */}
                <div className="mb-8">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Bill To</h3>
                  <div className="text-lg font-medium text-gray-900">{clientName}</div>
                </div>

                {/* Entries */}
                <div className="space-y-8">
                  {Object.entries(groupedEntries).sort(([a], [b]) => a.localeCompare(b)).map(([matter, matterEntries]) => {
                    const matterTotal = matterEntries.reduce((sum, e) => sum + (e.amount_charged || 0), 0);
                    return (
                      <div key={matter} className="space-y-3">
                        <h4 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2">{matter}</h4>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-500 border-b border-gray-100">
                              <th className="py-2 font-medium w-[12%]">Date</th>
                              <th className="py-2 font-medium w-[50%]">Description</th>
                              <th className="py-2 font-medium text-right w-[10%]">Hours</th>
                              <th className="py-2 font-medium text-right w-[13%]">Rate</th>
                              <th className="py-2 font-medium text-right w-[15%]">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {matterEntries.sort((a,b) => (a.date || "").localeCompare(b.date || "")).map((entry, idx) => (
                              <tr key={idx} className="text-gray-700">
                                <td className="py-3 align-top whitespace-nowrap">{entry.date}</td>
                                <td className="py-3 align-top pr-4">{entry.description}</td>
                                <td className="py-3 align-top text-right">{entry.entry_type === 'time' ? (entry.predicted_time || 0).toFixed(1) : '-'}</td>
                                <td className="py-3 align-top text-right">{entry.entry_type === 'time' ? formatCurrency(entry.billing_rate || 0) : '-'}</td>
                                <td className="py-3 align-top text-right font-medium">{formatCurrency(entry.amount_charged || 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-gray-200">
                              <td colSpan={4} className="py-3 text-right font-semibold text-gray-600 text-xs uppercase tracking-wider">Matter Subtotal</td>
                              <td className="py-3 text-right font-bold text-gray-900">{formatCurrency(matterTotal)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })}
                </div>

                {/* Grand Total */}
                <div className="flex justify-end pt-8 mt-8 border-t-2 border-gray-900">
                  <div className="w-64">
                    <div className="flex justify-between items-center text-xl font-bold text-gray-900">
                      <span>Total Due</span>
                      <span>{formatCurrency(grandTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="pt-16 text-center text-xs text-gray-400">
                  Please make all checks payable to {firmInfo.user || "Our Firm"}. Thank you for your business!
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
