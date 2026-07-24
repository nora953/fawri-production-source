import React from 'react';
import { FaInstagram, FaFacebookMessenger, FaTelegram, FaWhatsapp, FaTiktok } from 'react-icons/fa';
import { Platform } from '@/lib/types';

interface PlatformIconProps {
  platform: Platform | 'whatsapp' | 'tiktok';
  className?: string;
}

export function PlatformIcon({ platform, className = "w-6 h-6" }: PlatformIconProps) {
  switch (platform) {
    case 'instagram':
      return (
        <div className={`flex items-center justify-center rounded-lg bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500 text-white ${className}`}>
          <FaInstagram className="w-1/2 h-1/2" />
        </div>
      );
    case 'messenger':
      return (
        <div className={`flex items-center justify-center rounded-lg bg-gradient-to-b from-blue-400 to-blue-600 text-white ${className}`}>
          <FaFacebookMessenger className="w-1/2 h-1/2" />
        </div>
      );
    case 'telegram':
      return (
        <div className={`flex items-center justify-center rounded-lg bg-[#229ED9] text-white ${className}`}>
          <FaTelegram className="w-1/2 h-1/2" />
        </div>
      );
    case 'whatsapp':
      return (
        <div className={`flex items-center justify-center rounded-lg bg-[#25D366] text-white ${className}`}>
          <FaWhatsapp className="w-1/2 h-1/2" />
        </div>
      );
    case 'tiktok':
      return (
        <div className={`flex items-center justify-center rounded-lg bg-black text-white ${className}`}>
          <FaTiktok className="w-1/2 h-1/2" />
        </div>
      );
    default:
      return null;
  }
}
