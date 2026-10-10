import { Router } from 'express';
import { config } from '../config.js';
import { PublicConfigResponse } from '@fast-learning/shared';

const router = Router();

router.get('/', (req, res) => {
  const response: PublicConfigResponse = {
    googleClientId: config.GOOGLE_CLIENT_ID || '',
    appleClientId: config.APPLE_CLIENT_ID || ''
  };
  res.json(response);
});

export default router;
