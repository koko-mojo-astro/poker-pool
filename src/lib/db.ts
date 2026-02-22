import { init } from '@instantdb/react';
import schema from '../instant.schema';

const APP_ID = 'febc5aac-8f94-4fd0-99ee-9f6565721ef2';

export const db = init({ appId: APP_ID, schema });
