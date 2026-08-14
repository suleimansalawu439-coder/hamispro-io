import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminSettings() {
  const { data: settings, isLoading } = trpc.admin.systemSettings.useQuery();
  const updateSetting = trpc.admin.updateSetting.useMutation();
  const uploadMedia = trpc.admin.uploadMedia.useMutation();
  const utils = trpc.useUtils();

  const [faviconUrl, setFaviconUrl] = useState<string>("");
  const [ogImageUrl, setOgImageUrl] = useState<string>("");
  
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const ogImageInputRef = useRef<HTMLInputElement>(null);

  // Sync state when settings load
  if (settings && faviconUrl === "" && ogImageUrl === "") {
    const fav = settings.find(s => s.key === "site_favicon_url")?.value || "";
    const og = settings.find(s => s.key === "site_og_image_url")?.value || "";
    if (fav !== faviconUrl) setFaviconUrl(fav);
    if (og !== ogImageUrl) setOgImageUrl(og);
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: "favicon" | "ogImage") => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Quick validation
    if (type === "favicon" && !["image/x-icon", "image/png", "image/svg+xml"].includes(file.type)) {
      toast.error("Favicon must be .ico, .png, or .svg");
      return;
    }
    
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Raw = reader.result as string;
      const base64 = base64Raw.split(",")[1];
      
      const toastId = toast.loading(`Uploading ${type === "favicon" ? "Favicon" : "OG Image"}...`);
      try {
        const uploaded = await uploadMedia.mutateAsync({
          fileName: file.name,
          mimeType: file.type,
          base64,
          sizeBytes: file.size,
        });
        
        if (type === "favicon") {
          setFaviconUrl(uploaded.url);
          await updateSetting.mutateAsync({ key: "site_favicon_url", value: uploaded.url });
        } else {
          setOgImageUrl(uploaded.url);
          await updateSetting.mutateAsync({ key: "site_og_image_url", value: uploaded.url });
        }
        
        utils.admin.systemSettings.invalidate();
        toast.success("Uploaded and saved successfully", { id: toastId });
      } catch (err: any) {
        toast.error(err.message || "Failed to upload", { id: toastId });
      }
    };
    reader.readAsDataURL(file);
  };

  const clearSetting = async (type: "favicon" | "ogImage") => {
    const key = type === "favicon" ? "site_favicon_url" : "site_og_image_url";
    try {
      await updateSetting.mutateAsync({ key, value: "" });
      if (type === "favicon") setFaviconUrl("");
      else setOgImageUrl("");
      utils.admin.systemSettings.invalidate();
      toast.success("Setting cleared.");
    } catch (err: any) {
      toast.error(err.message || "Failed to clear setting");
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="page-wrap admin-panel">
        <div className="admin-toolbar">
          <div>
            <div className="eyebrow">Settings</div>
            <h1>Site Settings</h1>
            <p style={{ color: "var(--muted-foreground)", margin: ".7rem 0 0" }}>Manage global appearance settings</p>
          </div>
        </div>

      <div className="grid gap-6 max-w-4xl mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Brand Appearance</CardTitle>
            <CardDescription>Upload your Favicon and default Open Graph image. These will be served to all users.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <Label>Favicon (.ico, .png, .svg)</Label>
                <div className="border rounded-md p-4 flex flex-col items-center justify-center gap-4 min-h-[160px] bg-muted/20">
                  {faviconUrl ? (
                    <div className="relative group">
                      <img src={faviconUrl} alt="Favicon" className="w-16 h-16 object-contain" />
                      <button onClick={() => clearSetting("favicon")} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <ImagePlus className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No Favicon uploaded</p>
                    </div>
                  )}
                  <input type="file" ref={faviconInputRef} className="hidden" accept=".ico,.png,.svg" onChange={e => handleFileChange(e, "favicon")} />
                  <Button variant="outline" size="sm" onClick={() => faviconInputRef.current?.click()} disabled={uploadMedia.isPending}>
                    {uploadMedia.isPending ? "Uploading..." : "Upload Favicon"}
                  </Button>
                </div>
              </div>
              
              <div className="space-y-3">
                <Label>Default Open Graph Image</Label>
                <div className="border rounded-md p-4 flex flex-col items-center justify-center gap-4 min-h-[160px] bg-muted/20">
                  {ogImageUrl ? (
                    <div className="relative group w-full">
                      <img src={ogImageUrl} alt="OG Image" className="w-full h-32 object-cover rounded" />
                      <button onClick={() => clearSetting("ogImage")} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <ImagePlus className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No OG Image uploaded</p>
                    </div>
                  )}
                  <input type="file" ref={ogImageInputRef} className="hidden" accept="image/*" onChange={e => handleFileChange(e, "ogImage")} />
                  <Button variant="outline" size="sm" onClick={() => ogImageInputRef.current?.click()} disabled={uploadMedia.isPending}>
                    {uploadMedia.isPending ? "Uploading..." : "Upload OG Image"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </DashboardLayout>
  );
}
