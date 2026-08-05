import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Eye,
  Headphones,
  Loader2,
  MessageCircle,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';

import { useI18n } from '@/lib/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog