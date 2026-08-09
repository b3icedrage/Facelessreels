import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, isAuthenticated } = convexAuth({
  providers: [Password],
});
