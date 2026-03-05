"use client";

import { useState } from "react";
import { supabase } from "@/app/lib/supabaseClient";

interface AuthScreenProps {
	onSuccess: (userId: string, username: string) => void;
}

type Mode = "sign-in" | "sign-up";
type Status = "idle" | "loading" | "success";

export default function AuthScreen({ onSuccess }: AuthScreenProps) {
	const [mode, setMode] = useState<Mode>("sign-in");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [username, setUsername] = useState("");
	const [status, setStatus] = useState<Status>("idle");
	const [errorMsg, setErrorMsg] = useState("");

	const switchMode = (m: Mode) => {
		setMode(m);
		setErrorMsg("");
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setStatus("loading");
		setErrorMsg("");

		try {
			if (mode === "sign-up") {
				const trimmedUsername = username.trim();

				// Pass username in auth metadata — this is stored server-side in
				// auth.users.raw_user_meta_data regardless of email confirmation or
				// RLS, so it is always available as a fallback.
				const { data, error: signUpError } = await supabase.auth.signUp({
					email: email.trim(),
					password,
					options: { data: { username: trimmedUsername } },
				});
				if (signUpError) throw signUpError;
				const user = data.user;
				if (!user)
					throw new Error("Sign-up succeeded but no user was returned.");

				// Also write to the profiles table. This may be blocked silently by
				// RLS when email confirmation is enabled (no session yet), which is
				// why we also store it in auth metadata above.
				const { error: profileError } = await supabase
					.from("profiles")
					.upsert(
						{ id: user.id, username: trimmedUsername },
						{ onConflict: "id" },
					);
				// Log but don't hard-fail — the metadata copy is the reliable source.
				if (profileError) {
					console.warn(
						"[AuthScreen] profiles upsert failed (likely RLS / unconfirmed email):",
						profileError.message,
					);
				}

				setStatus("success");
				setTimeout(() => onSuccess(user.id, trimmedUsername), 900);
			} else {
				const { data, error: signInError } =
					await supabase.auth.signInWithPassword({
						email: email.trim(),
						password,
					});
				if (signInError) throw signInError;

				const { data: profile, error: profileError } = await supabase
					.from("profiles")
					.select("username")
					.eq("id", data.user.id)
					.single();
				if (profileError && profileError.code !== "PGRST116")
					throw profileError;

				// Fall back to auth metadata when the profile row is missing or
				// the username column is NULL (RLS blocked the upsert at sign-up time).
				let resolvedUsername = (profile?.username ?? "") as string;
				if (!resolvedUsername) {
					const {
						data: { user: authUser },
					} = await supabase.auth.getUser();
					resolvedUsername = (authUser?.user_metadata?.username ??
						"") as string;
				}

				if (!resolvedUsername) {
					throw new Error(
						"Your account has no display name. Please sign up again or contact support.",
					);
				}

				// Backfill the profile row if it was missing.
				if (!profile?.username) {
					await supabase
						.from("profiles")
						.upsert(
							{ id: data.user.id, username: resolvedUsername },
							{ onConflict: "id" },
						);
				}

				setStatus("success");
				setTimeout(() => onSuccess(data.user.id, resolvedUsername), 900);
			}
		} catch (err: unknown) {
			setErrorMsg(
				err instanceof Error ? err.message : "Something went wrong. Try again.",
			);
			setStatus("idle");
		}
	};

	const isLoading = status === "loading";
	const isSuccess = status === "success";

	return (
		<div className="flex items-center justify-center min-h-[100dvh] bg-gray-900 px-4 py-8">
			<div className="bg-gray-800 rounded-xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-gray-700">
				{/* Logo */}
				<div className="flex items-center justify-center mb-6">
					<div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center">
						<svg
							className="w-8 h-8 text-white"
							fill="currentColor"
							viewBox="0 0 20 20"
						>
							<path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
						</svg>
					</div>
				</div>

				{isSuccess ? (
					<div className="text-center">
						<div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-4">
							<svg
								className="w-6 h-6 text-white"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2.5}
									d="M5 13l4 4L19 7"
								/>
							</svg>
						</div>
						<h2 className="text-2xl font-bold text-white">
							{mode === "sign-up" ? "Account created!" : "Welcome back!"}
						</h2>
					</div>
				) : (
					<>
						{/* Mode toggle */}
						<div className="flex rounded-lg overflow-hidden border border-gray-700 mb-6">
							<button
								type="button"
								onClick={() => switchMode("sign-in")}
								className={`flex-1 py-2 text-sm font-semibold transition ${mode === "sign-in" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}
							>
								Sign In
							</button>
							<button
								type="button"
								onClick={() => switchMode("sign-up")}
								className={`flex-1 py-2 text-sm font-semibold transition ${mode === "sign-up" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}
							>
								Create Account
							</button>
						</div>

						<form onSubmit={handleSubmit} className="space-y-4">
							{mode === "sign-up" && (
								<div>
									<label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">
										Display Name
									</label>
									<input
										type="text"
										value={username}
										onChange={(e) => setUsername(e.target.value)}
										placeholder="ShadowWalker"
										className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600 transition"
										maxLength={32}
										disabled={isLoading}
										required
										autoComplete="off"
									/>
								</div>
							)}

							<div>
								<label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">
									Email
								</label>
								<input
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="you@example.com"
									className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600 transition"
									disabled={isLoading}
									required
									autoComplete="email"
								/>
							</div>

							<div>
								<label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">
									Password
								</label>
								<input
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder="••••••••"
									className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600 transition"
									disabled={isLoading}
									required
									minLength={6}
									autoComplete={
										mode === "sign-up" ? "new-password" : "current-password"
									}
								/>
							</div>

							{errorMsg && (
								<div className="flex items-start gap-2 p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">
									<svg
										className="w-4 h-4 mt-0.5 flex-shrink-0"
										fill="currentColor"
										viewBox="0 0 20 20"
									>
										<path
											fillRule="evenodd"
											d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
											clipRule="evenodd"
										/>
									</svg>
									{errorMsg}
								</div>
							)}

							<button
								type="submit"
								disabled={isLoading}
								className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
							>
								{isLoading ? (
									<>
										<svg
											className="w-4 h-4 animate-spin"
											fill="none"
											viewBox="0 0 24 24"
										>
											<circle
												className="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												strokeWidth="4"
											/>
											<path
												className="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
											/>
										</svg>
										{mode === "sign-up"
											? "Creating account..."
											: "Signing in..."}
									</>
								) : mode === "sign-up" ? (
									"Create Account"
								) : (
									"Sign In"
								)}
							</button>
						</form>
					</>
				)}
			</div>
		</div>
	);
}
