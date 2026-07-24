import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { Loader, Settings, Save, AlertCircle, Palette, GitBranch, Timer } from 'lucide-react';
import apiClient from '../lib/api';

interface RestaurantTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
}

interface RestaurantProfile {
  name: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: string;
  googleReviewUrl?: string;
  gstNumber?: string;
  whatsapp?: string;
  timings?: {
    open: string;
    close: string;
  };
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
  paymentMethods?: {
    cash: boolean;
    card: boolean;
    upi: boolean;
    razorpay: boolean;
  };
  razorpayConfig?: {
    keyId?: string;
    keySecret?: string;
  };
  theme: RestaurantTheme;
}

export const ManagerSettings: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const activeRestaurantId = user?.restaurants?.[0];

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('23:00');

  // Social Links
  const [facebook, setFacebook] = useState('');
  const [instagram, setInstagram] = useState('');
  const [twitter, setTwitter] = useState('');

  // Payment Methods
  const [cashEnabled, setCashEnabled] = useState(true);
  const [cardEnabled, setCardEnabled] = useState(true);
  const [upiEnabled, setUpiEnabled] = useState(true);
  const [razorpayEnabled, setRazorpayEnabled] = useState(false);
  const [razorpayKeyId, setRazorpayKeyId] = useState('');
  const [razorpayKeySecret, setRazorpayKeySecret] = useState('');

  // Theme states
  const [primaryColor, setPrimaryColor] = useState('#111827');
  const [secondaryColor, setSecondaryColor] = useState('#FFFFFF');
  const [accentColor, setAccentColor] = useState('#F59E0B');
  const [fontFamily, setFontFamily] = useState('Plus Jakarta Sans');

  // Order Workflow & Automation
  const [orderWorkflowMode, setOrderWorkflowMode] = useState<'FIVE_STEP' | 'FOUR_STEP' | 'THREE_STEP'>('FIVE_STEP');
  const [autoAcceptEnabled, setAutoAcceptEnabled] = useState(false);
  const [autoAcceptDelay, setAutoAcceptDelay] = useState(10);

  // Fetch restaurant details
  const { data: restaurantResponse, isLoading } = useQuery({
    queryKey: ['restaurantProfileInfo', activeRestaurantId],
    queryFn: async () => {
      const res = await apiClient.get(`/restaurants/${activeRestaurantId}`);
      return res.data;
    },
    enabled: !!activeRestaurantId,
  });

  // Sync state on load
  useEffect(() => {
    if (restaurantResponse?.success && restaurantResponse?.data) {
      const p: RestaurantProfile = restaurantResponse.data;
      setName(p.name || '');
      setDescription(p.description || '');
      setPhone(p.phone || '');
      setEmail(p.email || '');
      setAddress(p.address || '');
      setGoogleReviewUrl(p.googleReviewUrl || '');
      setGstNumber(p.gstNumber || '');
      setWhatsapp(p.whatsapp || '');

      if (p.timings) {
        setOpenTime(p.timings.open || '09:00');
        setCloseTime(p.timings.close || '23:00');
      }

      if (p.socialLinks) {
        setFacebook(p.socialLinks.facebook || '');
        setInstagram(p.socialLinks.instagram || '');
        setTwitter(p.socialLinks.twitter || '');
      }

      if (p.paymentMethods) {
        setCashEnabled(!!p.paymentMethods.cash);
        setCardEnabled(!!p.paymentMethods.card);
        setUpiEnabled(!!p.paymentMethods.upi);
        setRazorpayEnabled(!!p.paymentMethods.razorpay);
      }

      if (p.razorpayConfig) {
        setRazorpayKeyId(p.razorpayConfig.keyId || '');
        setRazorpayKeySecret(p.razorpayConfig.keySecret || '');
      }

      if (p.theme) {
        setPrimaryColor(p.theme.primaryColor || '#111827');
        setSecondaryColor(p.theme.secondaryColor || '#FFFFFF');
        setAccentColor(p.theme.accentColor || '#F59E0B');
        setFontFamily(p.theme.fontFamily || 'Plus Jakarta Sans');
      }

      const raw = restaurantResponse.data as any;
      setOrderWorkflowMode(raw.orderWorkflowMode || 'FIVE_STEP');
      setAutoAcceptEnabled(!!(raw.autoAcceptConfig?.enabled));
      setAutoAcceptDelay(raw.autoAcceptConfig?.delaySeconds ?? 10);
    }
  }, [restaurantResponse]);

  // Update Settings mutation
  const updateMutation = useMutation({
    mutationFn: async (payload: RestaurantProfile) => {
      const res = await apiClient.patch(`/restaurants/${activeRestaurantId}`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast('Restaurant settings successfully updated!', 'success');
      queryClient.invalidateQueries({ queryKey: ['restaurantProfileInfo', activeRestaurantId] });
    },
    onError: (err: any) => {
      toast(err.response?.data?.error?.message || 'Error updating settings', 'error');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast('Restaurant Name is required', 'error');
      return;
    }

    const payload: RestaurantProfile = {
      name: name.trim(),
      description: description.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      googleReviewUrl: googleReviewUrl.trim() || undefined,
      gstNumber: gstNumber.trim() || undefined,
      whatsapp: whatsapp.trim() || undefined,
      timings: {
        open: openTime,
        close: closeTime,
      },
      socialLinks: {
        facebook: facebook.trim(),
        instagram: instagram.trim(),
        twitter: twitter.trim(),
      },
      paymentMethods: {
        cash: cashEnabled,
        card: cardEnabled,
        upi: upiEnabled,
        razorpay: razorpayEnabled,
      },
      razorpayConfig: {
        keyId: razorpayKeyId.trim(),
        keySecret: razorpayKeySecret.trim(),
      },
      theme: {
        primaryColor,
        secondaryColor,
        accentColor,
        fontFamily,
      },
      orderWorkflowMode,
      autoAcceptConfig: {
        enabled: autoAcceptEnabled,
        delaySeconds: autoAcceptDelay,
      },
    } as any;

    updateMutation.mutate(payload);
  };

  if (!activeRestaurantId) {
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mb-3 animate-pulse" />
        <h3 className="font-bold text-slate-800">No Restaurant Configured</h3>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader className="w-6 h-6 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 pb-24 font-sans">
      <div className="mb-8">
        <h3 className="font-display text-3xl font-semibold text-slate-900 flex items-center gap-2">
          <Settings className="w-8 h-8 text-amber-500" strokeWidth={1.75} />
          <span>Restaurant Settings</span>
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Configure physical details, support links, and visual branding variables.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Profile Card */}
        <div className="bg-white rounded-3xl border border-slate-150 p-6 shadow-sm space-y-4">
          <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <span>Core Contact Profiles</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Restaurant Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="The Woodfired Bistro"
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Contact Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9876543210"
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Support Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@woodfired.com"
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Google Review URL</label>
              <input
                type="url"
                value={googleReviewUrl}
                onChange={(e) => setGoogleReviewUrl(e.target.value)}
                placeholder="https://g.page/r/..."
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">GST Number</label>
              <input
                type="text"
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value)}
                placeholder="27AAAAA1111A1Z1"
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">WhatsApp Contact</label>
              <input
                type="text"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+919876543210"
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Opening Time</label>
              <input
                type="time"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Closing Time</label>
              <input
                type="time"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Restaurant Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Serving genuine hand-tossed sourdough pizza in a rustic woodfired furnace..."
              className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 h-20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Physical Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="456 Gourmet Lane, Mumbai, Maharashtra"
              className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Social Links Card */}
        <div className="bg-white rounded-3xl border border-slate-150 p-6 shadow-sm space-y-4">
          <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <span>Social Media Channels</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Facebook Profile</label>
              <input
                type="text"
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                placeholder="https://facebook.com/mybistro"
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Instagram Handle</label>
              <input
                type="text"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="https://instagram.com/mybistro"
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Twitter Channel</label>
              <input
                type="text"
                value={twitter}
                onChange={(e) => setTwitter(e.target.value)}
                placeholder="https://twitter.com/mybistro"
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Payments Channels Config Card */}
        <div className="bg-white rounded-3xl border border-slate-150 p-6 shadow-sm space-y-4">
          <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <span>Payment Methods & Channels</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <label className="flex items-center gap-2.5 p-3.5 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={cashEnabled}
                onChange={(e) => setCashEnabled(e.target.checked)}
                className="h-4 w-4 rounded text-amber-500 focus:ring-amber-500 border-slate-300"
              />
              <span className="text-xs font-bold text-slate-700">Accept Cash</span>
            </label>

            <label className="flex items-center gap-2.5 p-3.5 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={cardEnabled}
                onChange={(e) => setCardEnabled(e.target.checked)}
                className="h-4 w-4 rounded text-amber-500 focus:ring-amber-500 border-slate-300"
              />
              <span className="text-xs font-bold text-slate-700">Accept Card</span>
            </label>

            <label className="flex items-center gap-2.5 p-3.5 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={upiEnabled}
                onChange={(e) => setUpiEnabled(e.target.checked)}
                className="h-4 w-4 rounded text-amber-500 focus:ring-amber-500 border-slate-300"
              />
              <span className="text-xs font-bold text-slate-700">UPI Payments</span>
            </label>

            <label className="flex items-center gap-2.5 p-3.5 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={razorpayEnabled}
                onChange={(e) => setRazorpayEnabled(e.target.checked)}
                className="h-4 w-4 rounded text-amber-500 focus:ring-amber-500 border-slate-300"
              />
              <span className="text-xs font-bold text-slate-700 font-sans">Razorpay Gateway</span>
            </label>
          </div>

          {razorpayEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Razorpay Key ID</label>
                <input
                  type="text"
                  value={razorpayKeyId}
                  onChange={(e) => setRazorpayKeyId(e.target.value)}
                  placeholder="rzp_test_..."
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Razorpay Key Secret</label>
                <input
                  type="password"
                  value={razorpayKeySecret}
                  onChange={(e) => setRazorpayKeySecret(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
            </div>
          )}
        </div>

        {/* Branding Theme Card */}
        <div className="bg-white rounded-3xl border border-slate-150 p-6 shadow-sm space-y-4">
          <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-amber-500" strokeWidth={1.75} />
            <span>Theme & Branding Colors</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Primary Color */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600">Primary Color</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-12 border border-slate-200 rounded-lg cursor-pointer p-0"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
            </div>

            {/* Secondary Color */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600">Secondary Color</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-10 w-12 border border-slate-200 rounded-lg cursor-pointer p-0"
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
            </div>

            {/* Accent Color */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600">Accent Color</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-10 w-12 border border-slate-200 rounded-lg cursor-pointer p-0"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Branding Font Family</label>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-amber-500"
            >
              <option value="Plus Jakarta Sans">Plus Jakarta Sans (Modern Sans-Serif)</option>
              <option value="Instrument Serif">Instrument Serif (Elegant Display Serif)</option>
              <option value="Fraunces">Fraunces (Warm Editorial Serif)</option>
              <option value="JetBrains Mono">JetBrains Mono (Technical Monospace)</option>
              <option value="DM Mono">DM Mono (Clean Monospace)</option>
            </select>
          </div>
        </div>

        {/* Order Workflow & Automation Card */}
        <div className="bg-white rounded-3xl border border-slate-150 p-6 shadow-sm space-y-6">
          <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <GitBranch className="w-4 h-4 text-amber-500" strokeWidth={1.75} />
            <span>Order Workflow Mode</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              {
                value: 'FIVE_STEP',
                label: '5-Step Standard',
                desc: 'New → Accepted → Preparing → Ready → Served',
                steps: ['New', 'Accepted', 'Preparing', 'Ready', 'Served'],
                colors: ['bg-amber-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-purple-500', 'bg-blue-500'],
              },
              {
                value: 'FOUR_STEP',
                label: '4-Step Kitchen & Ready',
                desc: 'New → Preparing → Ready → Served',
                steps: ['New', 'Preparing', 'Ready', 'Served'],
                colors: ['bg-amber-500', 'bg-indigo-500', 'bg-purple-500', 'bg-blue-500'],
              },
              {
                value: 'THREE_STEP',
                label: '3-Step Express',
                desc: 'New → Preparing → Served',
                steps: ['New', 'Preparing', 'Served'],
                colors: ['bg-amber-500', 'bg-indigo-500', 'bg-blue-500'],
              },
            ] as const).map((mode) => {
              const isSelected = orderWorkflowMode === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setOrderWorkflowMode(mode.value)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 space-y-3 ${
                    isSelected
                      ? 'border-amber-500 bg-amber-50/50 shadow-md'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className={`text-sm font-extrabold ${ isSelected ? 'text-amber-700' : 'text-slate-800'}`}>{mode.label}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{mode.desc}</p>
                    </div>
                    {isSelected && (
                      <span className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white fill-current"><path d="M1.5 6.5l3 3L10.5 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {mode.steps.map((step, i) => (
                      <div key={step} className="flex items-center gap-1.5">
                        <div className={`h-1.5 w-6 rounded-full ${mode.colors[i]}`} />
                        <span className="text-[9px] font-bold text-slate-500">{step}</span>
                        {i < mode.steps.length - 1 && <span className="text-[9px] text-slate-300">›</span>}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Auto-Accept Automation */}
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-amber-500" strokeWidth={1.75} />
              <span>Auto-Accept Orders</span>
            </h4>

            <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition">
              <div className="mt-0.5">
                <input
                  type="checkbox"
                  checked={autoAcceptEnabled}
                  onChange={(e) => setAutoAcceptEnabled(e.target.checked)}
                  className="h-4 w-4 rounded text-amber-500 accent-amber-500 border-slate-300"
                />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">Automatically accept new orders</p>
                <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                  New orders will be auto-accepted and moved to{' '}
                  <strong>{orderWorkflowMode === 'FIVE_STEP' ? 'Accepted' : 'Preparing'}</strong>{' '}
                  after the specified delay. Great for busy restaurants.
                </p>
              </div>
            </label>

            {autoAcceptEnabled && (
              <div className="ml-1 space-y-3">
                <label className="block text-xs font-semibold text-slate-600">Auto-accept delay</label>
                <div className="flex flex-wrap gap-2">
                  {[5, 10, 15, 30, 60, 120].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setAutoAcceptDelay(sec)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                        autoAcceptDelay === sec
                          ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300'
                      }`}
                    >
                      {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  Orders will auto-advance after <strong className="text-slate-600">{autoAcceptDelay < 60 ? `${autoAcceptDelay} seconds` : `${autoAcceptDelay / 60} minute(s)`}</strong>.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={updateMutation.isPending}
          className="w-full py-4 bg-slate-950 hover:bg-slate-800 text-white font-extrabold text-sm rounded-2xl transition flex items-center justify-center gap-2 shadow-md disabled:bg-slate-400 active:scale-[0.98]"
        >
          {updateMutation.isPending ? (
            <Loader className="w-5 h-5 animate-spin" strokeWidth={1.75} />
          ) : (
            <Save className="w-5 h-5" strokeWidth={1.75} />
          )}
          <span>Save Configuration Changes</span>
        </button>
      </form>
    </div>
  );
};
export default ManagerSettings;
