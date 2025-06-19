import { z } from 'zod';

import {
  getFolderByIdParams,
  getFolderByIdQueryParams,
  moveFolderBody,
  moveFolderParams,
  updateFolderNameBody,
  updateFolderNameParams,
} from '../generated/carbon-voice-api/CarbonVoiceSimplifiedAPI.zod';

type FolderPathParams = z.infer<typeof getFolderByIdParams>;
type FolderQueryParams = z.infer<typeof getFolderByIdQueryParams>;
export type GetFolderInput = FolderPathParams & FolderQueryParams;

export type UpdateFolderNameInput = z.infer<typeof updateFolderNameParams> &
  z.infer<typeof updateFolderNameBody>;

export type MoveFolderInput = z.infer<typeof moveFolderParams> &
  z.infer<typeof moveFolderBody>;
