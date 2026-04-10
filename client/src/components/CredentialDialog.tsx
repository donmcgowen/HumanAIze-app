import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface CredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: {
    id: number;
    displayName: string;
    category: string;
    authType: "oauth" | "api_key" | "partner" | "custom";
  };
  onSubmit: (credentials: Record<string, string>) => Promise<void>;
  isLoading?: boolean;
}

const credentialConfigs: Record<string, { fields: Array<{ key: string; label: string; type: string; placeholder: string; required: boolean }> }> = {
  "dexcom-cgm": {
    fields: [
      {
        key: "accessToken",
        label: "Access Token",
        type: "password",
        placeholder: "Paste your Dexcom OAuth access token",
        required: true,
      },
      {
        key: "refreshToken",
        label: "Refresh Token (Optional)",
        type: "password",
        placeholder: "Paste your Dexcom refresh token for automatic renewal",
        required: false,
      },
    ],
  },
  "glooko": {
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        placeholder: "Paste your Glooko API key",
        required: true,
      },
      {
        key: "apiSecret",
        label: "API Secret",
        type: "password",
        placeholder: "Paste your Glooko API secret",
        required: true,
      },
    ],
  },
  fitbit: {
    fields: [
      {
        key: "accessToken",
        label: "Access Token",
        type: "password",
        placeholder: "Paste your Fitbit OAuth access token",
        required: true,
      },
      {
        key: "refreshToken",
        label: "Refresh Token (Optional)",
        type: "password",
        placeholder: "Paste your Fitbit refresh token",
        required: false,
      },
      {
        key: "userId",
        label: "User ID",
        type: "text",
        placeholder: "Your Fitbit user ID",
        required: true,
      },
    ],
  },
  oura: {
    fields: [
      {
        key: "accessToken",
        label: "Access Token",
        type: "password",
        placeholder: "Paste your Oura OAuth access token",
        required: true,
      },
      {
        key: "refreshToken",
        label: "Refresh Token (Optional)",
        type: "password",
        placeholder: "Paste your Oura refresh token",
        required: false,
      },
    ],
  },

  "apple-health": {
    fields: [
      {
        key: "notes",
        label: "Setup Instructions",
        type: "textarea",
        placeholder: "Apple Health requires native iOS app integration. This is currently in development.",
        required: false,
      },
    ],
  },
  "google-fit": {
    fields: [
      {
        key: "accessToken",
        label: "Access Token",
        type: "password",
        placeholder: "Paste your Google Fit OAuth access token",
        required: true,
      },
      {
        key: "refreshToken",
        label: "Refresh Token (Optional)",
        type: "password",
        placeholder: "Paste your Google Fit refresh token",
        required: false,
      },
    ],
  },
  "custom-app": {
    fields: [
      {
        key: "appName",
        label: "App/Service Name",
        type: "text",
        placeholder: "e.g., Withings, Strava, Whoop",
        required: true,
      },
      {
        key: "category",
        label: "Data Category",
        type: "text",
        placeholder: "glucose, activity, nutrition, sleep, or other",
        required: true,
      },
      {
        key: "apiEndpoint",
        label: "API Endpoint (Optional)",
        type: "text",
        placeholder: "https://api.example.com/v1/data",
        required: false,
      },
      {
        key: "credentials",
        label: "Credentials (API Key, Token, etc.)",
        type: "password",
        placeholder: "Paste your API key, OAuth token, or authentication credentials",
        required: true,
      },
      {
        key: "notes",
        label: "Notes (Optional)",
        type: "textarea",
        placeholder: "Any additional information about this connection",
        required: false,
      },
    ],
  },
};

export function CredentialDialog({ open, onOpenChange, source, onSubmit, isLoading }: CredentialDialogProps) {
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  // Map display names to config keys
  const sourceKeyMap: Record<string, string> = {
    "Dexcom CGM": "dexcom",
    "Glooko": "glooko",
    "Fitbit": "fitbit",
    "Google Fit": "google-fit",
    "Apple Health": "apple-health",
    "MyFitnessPal": "myfitnesspal",
    "Cronometer": "cronometer",
    "Oura": "oura",
    "Custom App": "custom-app",
  };
  const sourceKey = sourceKeyMap[source.displayName] || source.displayName.toLowerCase().replace(/\s+/g, "-");
  const config = credentialConfigs[sourceKey];

  if (!config) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="border border-white/10 bg-slate-950">
          <DialogHeader>
            <DialogTitle className="text-white">{source.displayName}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
            <AlertCircle className="h-5 w-5 text-yellow-400" />
            <p className="text-sm text-yellow-200">Credential configuration not available for this source yet.</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const handleSubmit = async () => {
    const missingRequired = config.fields.filter((f) => f.required && !credentials[f.key]);
    if (missingRequired.length > 0) {
      toast.error(`Please fill in: ${missingRequired.map((f) => f.label).join(", ")}`);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(credentials);
      setCredentials({});
      onOpenChange(false);
      toast.success(`${source.displayName} connected successfully`);
    } catch (error) {
      toast.error(`Failed to connect ${source.displayName}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border border-white/10 bg-slate-950 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Connect {source.displayName}</DialogTitle>
          <DialogDescription className="text-slate-400">
            {source.authType === "oauth"
              ? "Paste your OAuth credentials below. Your tokens are encrypted and never shared."
              : source.authType === "api_key"
                ? "Paste your API credentials below. Your keys are encrypted and never shared."
                : "Enter your partner account credentials. Your credentials are encrypted and never shared."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {config.fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key} className="text-sm font-semibold text-white">
                {field.label}
                {field.required && <span className="ml-1 text-red-400">*</span>}
              </Label>

              {field.type === "textarea" ? (
                <Textarea
                  id={field.key}
                  placeholder={field.placeholder}
                  value={credentials[field.key] || ""}
                  onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                  disabled={submitting}
                  className="border-white/10 bg-slate-900 text-white placeholder:text-slate-500"
                  rows={3}
                />
              ) : (
                <div className="relative">
                  <Input
                    id={field.key}
                    type={field.type === "password" && !showPasswords[field.key] ? "password" : "text"}
                    placeholder={field.placeholder}
                    value={credentials[field.key] || ""}
                    onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                    disabled={submitting}
                    className="border-white/10 bg-slate-900 text-white placeholder:text-slate-500 pr-10"
                  />
                  {field.type === "password" && (
                    <button
                      type="button"
                      onClick={() => setShowPasswords({ ...showPasswords, [field.key]: !showPasswords[field.key] })}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showPasswords[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="flex-1 border-white/10 text-white hover:bg-white/5"
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="flex-1 bg-cyan-600 hover:bg-cyan-700">
            {submitting ? "Connecting..." : "Connect"}
          </Button>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-slate-900/50 p-3">
          <p className="text-xs text-slate-400">
            <strong>How to get credentials:</strong>
          </p>
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            {source.displayName === "Dexcom" && (
              <>
                <li>1. Visit developer.dexcom.com</li>
                <li>2. Create an OAuth application</li>
                <li>3. Authorize this app to access your glucose data</li>
                <li>4. Copy the access token from the authorization response</li>
              </>
            )}
            {source.displayName === "Glooko" && (
              <>
                <li>1. Contact Glooko for partner API access</li>
                <li>2. Receive your API key and secret</li>
                <li>3. Paste them in the fields above</li>
              </>
            )}
            {source.displayName === "Fitbit" && (
              <>
                <li>1. Visit dev.fitbit.com</li>
                <li>2. Create an OAuth application</li>
                <li>3. Authorize this app to access your fitness data</li>
                <li>4. Copy the access token and your user ID</li>
              </>
            )}
            {source.displayName === "Oura" && (
              <>
                <li>1. Visit cloud.ouraring.com</li>
                <li>2. Create an OAuth application</li>
                <li>3. Authorize this app to access your sleep data</li>
                <li>4. Copy the access token</li>
              </>
            )}
            {source.displayName === "Custom App" && (
              <>
                <li>1. Visit your app's developer portal</li>
                <li>2. Create an API application or get your API key</li>
                <li>3. Copy your authentication credentials</li>
                <li>4. Paste them in the fields above</li>
              </>
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
