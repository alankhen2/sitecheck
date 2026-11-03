import { ApiError } from './api';

/**
 * Text to show a user for a failed request. The API's own message is shown for
 * client errors (it was written for people: "Invalid email or password") and
 * for "cannot reach the server". Server errors and unexpected responses get a
 * generic text: their details are for logs, not for the screen.
 */
export function userMessage(error: unknown): string {
  if (error instanceof ApiError && (error.status === 0 || error.status < 500)) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
