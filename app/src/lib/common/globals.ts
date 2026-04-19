import type { Pixel } from "@prisma/client";

export type PixelUpdates = Pick<Pixel, "x" | "y" | "color">[];

export class PixelUpdatesController {
  private pixelUpdates: PixelUpdates = [];

  constructor() {}

  addPixelUpdate(update: PixelUpdates) {
    // Iterate over the new updates and replace existing ones with the same x and y
    for (const newUpdate of update) {
      const index = this.pixelUpdates.findIndex(
        (existingUpdate) =>
          existingUpdate.x === newUpdate.x && existingUpdate.y === newUpdate.y
      );

      if (index !== -1) {
        // Replace the existing update with the new one
        this.pixelUpdates.splice(index, 1, newUpdate);
      } else {
        // Add the new update to the array
        this.pixelUpdates.push(newUpdate);
      }
    }

    // Perform cleanup if the array length exceeds a certain limit
    if (this.pixelUpdates.length > 100) {
      this.pixelUpdates.shift();
    }
  }

  getPixelUpdates() {
    return this.pixelUpdates;
  }
}


export type UserPresence = {
  did: string;
  role: "USER" | "ADMIN";
  username: string;
  avatarUrl?: string;
  webProfileUrl?: string;
  last_seen: number;
  x: number;
  y: number;
}

class UserPresenceController {
  private userPresence: UserPresence[] = [];

  constructor() {}

  updateUserPosition(newPosition: UserPresence) {
    const existingUser = this.userPresence.find((up) => up.did === newPosition.did);
    if (existingUser) {
      if (newPosition.last_seen > existingUser.last_seen) {
        existingUser.x = newPosition.x;
        existingUser.y = newPosition.y;
        existingUser.last_seen = newPosition.last_seen;
        existingUser.username = newPosition.username;
        existingUser.avatarUrl = newPosition.avatarUrl;
        existingUser.webProfileUrl = newPosition.webProfileUrl;
        existingUser.role = newPosition.role;
      }
    } else {
      this.userPresence.push(newPosition);
    }
  }

  cleanupUserPresence() {
    const now = Date.now();
    this.userPresence = this.userPresence.filter((p) => p.last_seen > now - 1000 * 60 * 5);
  }

  getUserPresence() {
    return this.userPresence;
  }
}

export const userPresenceManager = new UserPresenceController();
export const pixelUpdatesManager = new PixelUpdatesController();
