import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, LogIn, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shouldShake, setShouldShake] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await login(data.email, data.password);
      navigate('/');
    } catch (err: any) {
      const errMsg = err.response?.data?.error?.message || 'Invalid email or password';
      setError(errMsg);
      // Trigger subtle shake animation
      setShouldShake(true);
      setTimeout(() => setShouldShake(false), 500);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleValidationError = () => {
    // Shake form on validation errors
    setShouldShake(true);
    setTimeout(() => setShouldShake(false), 500);
  };

  // Subtle horizontal shake sequence
  const shakeVariants = {
    shake: {
      x: [0, -8, 8, -6, 6, -3, 3, 0],
      transition: {
        duration: 0.35,
        ease: 'easeInOut',
      },
    },
    idle: { x: 0 },
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 font-sans selection:bg-amber-100">
      <div className="w-full max-w-md">
        {/* Logo and Headings */}
        <div className="text-center mb-8">
          <h1 className="font-display tracking-tight text-5xl font-normal text-slate-900 mb-2">
            Pixora QR
          </h1>
          <p className="text-sm text-slate-500 font-sans">
            Phase 1 Standalone Authentication Platform
          </p>
        </div>

        {/* Shake Wrapper around the Form */}
        <motion.div
          animate={shouldShake ? 'shake' : 'idle'}
          variants={shakeVariants}
          className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100"
        >
          <form onSubmit={handleSubmit(onSubmit, handleValidationError)} className="space-y-5">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2.5 text-xs text-red-600"
                >
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" strokeWidth={1.75} />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-4.5 w-4.5 text-slate-400" strokeWidth={1.75} />
                </span>
                <input
                  type="email"
                  placeholder="admin@pixora.dev"
                  {...register('email')}
                  className={`block w-full pl-10 pr-3 py-2.5 bg-slate-50/50 border rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:bg-white ${
                    errors.email
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10'
                      : 'border-slate-200 focus:border-amber-500'
                  }`}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-4.5 w-4.5 text-slate-400" strokeWidth={1.75} />
                </span>
                <input
                  type="password"
                  placeholder="••••••••"
                  {...register('password')}
                  className={`block w-full pl-10 pr-3 py-2.5 bg-slate-50/50 border rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:bg-white ${
                    errors.password
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10'
                      : 'border-slate-200 focus:border-amber-500'
                  }`}
                />
              </div>
              {errors.password && (
                <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="relative w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-slate-800 focus:ring-4 focus:ring-amber-500/20 transition-all disabled:opacity-75 disabled:cursor-not-allowed mt-2"
            >
              {isSubmitting ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <LogIn className="w-4.5 h-4.5" strokeWidth={1.75} />
                  <span>Log In</span>
                </>
              )}
            </button>
          </form>
        </motion.div>

        {/* Local Dev Disclaimer */}
        <p className="text-center text-xs text-slate-400 mt-8">
          Local Dev Only: <span className="font-mono">admin@pixora.dev</span> / <span className="font-mono">PixoraDemo123!</span>
        </p>
      </div>
    </div>
  );
};
export default Login;
