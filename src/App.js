/* global __firebase_config, __app_id, __initial_auth_token */
import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithCustomToken, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Trash2, Plus, Dumbbell, Zap, Weight, LogOut, BrainCircuit, X, Edit, ChevronRight } from 'lucide-react';

// --- Main App Component ---
export default function App() {
    // --- State Management ---
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [user, setUser] = useState(null);
    const [appId, setAppId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [configError, setConfigError] = useState(false);
    
    const [workouts, setWorkouts] = useState([]);
    const [weightLog, setWeightLog] = useState([]);
    const [currentWeight, setCurrentWeight] = useState('');
    const [view, setView] = useState('dashboard');
    const [loadingData, setLoadingData] = useState(true);
    const [editingWorkout, setEditingWorkout] = useState(null);

    // --- Firebase Initialization and Auth ---
    useEffect(() => {
        const initializeForProduction = async () => {
            let finalConfig;
            try {
                const response = await fetch('/__/firebase/init.json');
                if (response.ok) {
                    finalConfig = await response.json();
                } else {
                    throw new Error("Not on Firebase Hosting.");
                }
            } catch (e) {
                console.log("Could not fetch from /__/firebase/init.json. Falling back to Vercel environment variables.");
                finalConfig = {
                    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
                    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
                    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
                    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
                    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
                    appId: process.env.REACT_APP_FIREBASE_APP_ID,
                };
            }

            if (finalConfig && finalConfig.apiKey && finalConfig.projectId) {
                try {
                    const app = initializeApp(finalConfig);
                    const authInstance = getAuth(app);
                    setAuth(authInstance);
                    setDb(getFirestore(app));
                    setAppId(finalConfig.appId);
                    
                    const unsubscribe = onAuthStateChanged(authInstance, (user) => {
                        setUser(user);
                        setIsAuthReady(true);
                        setLoadingData(false);
                    });
                     return () => unsubscribe();
                } catch (initError) {
                    console.error("Firebase Initialization Failed:", initError);
                    setConfigError(true);
                }
            } else {
                console.error("Final configuration is missing or invalid. App cannot start.");
                setConfigError(true);
            }
        };

        if (typeof __firebase_config !== 'undefined' && typeof __initial_auth_token !== 'undefined') {
             try {
                const devConfig = JSON.parse(__firebase_config);
                const app = initializeApp(devConfig);
                const authInstance = getAuth(app);
                setAuth(authInstance);
                setDb(getFirestore(app));
                setAppId(devConfig.appId);

                const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                    if (user) {
                        setUser(user);
                    } else {
                        await signInWithCustomToken(authInstance, __initial_auth_token);
                    }
                    setIsAuthReady(true);
                });
                return () => unsubscribe();
            } catch (devError) {
                console.error("Dev Canvas initialization failed:", devError);
                setConfigError(true);
            }
        } else {
            initializeForProduction();
        }
    }, []);

    // --- Data Fetching for Authenticated User ---
    useEffect(() => {
        if (!isAuthReady || !db || !user || !appId) {
            setWorkouts([]);
            setWeightLog([]);
            if(isAuthReady && !user) setLoadingData(false);
            return;
        }
        
        setLoadingData(true);
        const basePath = `/artifacts/${appId}/users/${user.uid}`;

        const qWorkouts = query(collection(db, `${basePath}/workouts`));
        const unsubscribeWorkouts = onSnapshot(qWorkouts, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            data.sort((a, b) => new Date(b.date) - new Date(a.date));
            setWorkouts(data);
            setLoadingData(false);
        }, (err) => { console.error("Workout fetch error:", err); setLoadingData(false); });

        const qWeightLog = query(collection(db, `${basePath}/weightLog`));
        const unsubscribeWeightLog = onSnapshot(qWeightLog, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            data.sort((a, b) => new Date(b.date) - new Date(a.date));
            setWeightLog(data);
        }, (err) => console.error("Weight log fetch error:", err));

        return () => {
            unsubscribeWorkouts();
            unsubscribeWeightLog();
        };
    }, [isAuthReady, db, user, appId]);
    
     // --- Calculate Most Recent Weight ---
    useEffect(() => {
        const allEntries = [
            ...weightLog.filter(l => l.weight && l.date).map(l => ({ date: l.date, weight: l.weight })),
            ...workouts.filter(w => w.currentWeight && w.date).map(w => ({ date: w.date, weight: w.currentWeight }))
        ];
        if (allEntries.length > 0) {
            allEntries.sort((a, b) => new Date(b.date) - new Date(a.date));
            setCurrentWeight(allEntries[0].weight);
        } else {
            setCurrentWeight('');
        }
    }, [workouts, weightLog]);
    
    // --- Group Workouts by Date ---
    const groupedWorkouts = useMemo(() => {
        const groups = workouts.reduce((acc, workout) => {
            const date = workout.date;
            if (!acc[date]) {
                acc[date] = [];
            }
            acc[date].push(workout);
            return acc;
        }, {});

        return Object.entries(groups)
            .map(([date, activities]) => ({ date, activities }))
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [workouts]);


    // --- Auth Functions ---
    const signInWithGoogle = async () => {
        if (!auth) return;
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Error signing in with Google:", error);
        }
    };

    const handleSignOut = async () => {
        if (!auth) return;
        try {
            await signOut(auth);
            setUser(null);
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    // --- Data Handlers ---
    const handleAddWorkout = async (workout) => {
        if (!db || !user || !appId) return;
        const path = `/artifacts/${appId}/users/${user.uid}/workouts`;
        const data = { ...workout };
        if (!data.currentWeight) delete data.currentWeight;
        await addDoc(collection(db, path), data);
        setView('dashboard');
    };
    
    const handleUpdateWorkout = async (workoutId, workoutData) => {
        if (!db || !user || !appId) return;
        const path = `/artifacts/${appId}/users/${user.uid}/workouts/${workoutId}`;
        const docRef = doc(db, path);
        await updateDoc(docRef, workoutData);
        setView('dashboard');
        setEditingWorkout(null);
    };

    const handleLogWeight = async (weightEntry) => {
        if (!db || !user || !appId) return;
        const path = `/artifacts/${appId}/users/${user.uid}/weightLog`;
        await addDoc(collection(db, path), weightEntry);
        setView('dashboard');
    };

    const handleDeleteWorkout = async (id) => {
        if (!db || !user || !appId) return;
        const path = `/artifacts/${appId}/users/${user.uid}/workouts/${id}`;
        await deleteDoc(doc(db, path));
    };

    const startEditWorkout = (workout) => {
        setEditingWorkout(workout);
        setView('editWorkout');
    };

    // --- Render Logic ---
    if (configError) {
        return <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white text-center p-4"><X className="w-16 h-16 text-red-500 mb-4" /><h2 className="text-2xl font-bold mb-2">Configuration Error</h2><p className="max-w-md">Failed to initialize Firebase. Please check your hosting setup and environment variables.</p></div>;
    }
    
    if (!isAuthReady) {
        return <div className="flex items-center justify-center h-screen bg-gray-900 text-white"><Dumbbell className="w-16 h-16 animate-spin mx-auto text-cyan-400" /><p className="mt-4 text-lg">Connecting...</p></div>;
    }

    if (!user) {
        return <LoginScreen onSignIn={signInWithGoogle} />;
    }
    
    const renderView = () => {
        if (loadingData) {
            return <div className="flex items-center justify-center h-64"><Dumbbell className="w-12 h-12 animate-spin text-cyan-400" /></div>;
        }
        switch (view) {
            case 'addWorkout': return <WorkoutForm onSave={handleAddWorkout} onCancel={() => setView('dashboard')} />;
            case 'editWorkout': return <WorkoutForm onSave={(data) => handleUpdateWorkout(editingWorkout.id, data)} onCancel={() => { setView('dashboard'); setEditingWorkout(null); }} existingWorkout={editingWorkout} />;
            case 'logWeight': return <LogWeightForm onLogWeight={handleLogWeight} onCancel={() => setView('dashboard')} />;
            case 'generatePlan': return <GeneratePlanView onCancel={() => setView('dashboard')} />;
            default: return <Dashboard workouts={groupedWorkouts} totalWorkoutsCount={workouts.length} currentWeight={currentWeight} setView={setView} onDeleteWorkout={handleDeleteWorkout} onEditWorkout={startEditWorkout} />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
            <header className="bg-gray-800 shadow-lg p-4 sticky top-0 z-10">
                <div className="container mx-auto max-w-4xl flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-cyan-400 flex items-center"><Dumbbell className="mr-3" />FitTrack</h1>
                    <div className="flex items-center space-x-4">
                        <img src={user.photoURL || `https://placehold.co/40x40/475569/E0E7FF?text=${user.displayName ? user.displayName.charAt(0) : 'U'}`} alt="User profile" className="w-10 h-10 rounded-full border-2 border-cyan-400" />
                        <span className="font-semibold text-white hidden sm:block">Hi, {user.displayName || 'User'}!</span>
                        <button onClick={handleSignOut} className="flex items-center text-gray-300 hover:text-cyan-400 transition-colors" title="Sign Out"><LogOut size={20}/></button>
                    </div>
                </div>
            </header>
            <main className="container mx-auto max-w-4xl p-4 md:p-6">{renderView()}</main>
            <footer className="text-center p-4 text-gray-500 text-xs"><p>Built with React & Firebase. Powered by Gemini.</p></footer>
        </div>
    );
}

// --- Login Screen Component ---
const LoginScreen = ({ onSignIn }) => {
    return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 text-white">
            <div className="text-center">
                <Dumbbell className="w-20 h-20 text-cyan-400 mx-auto mb-4" />
                <h1 className="text-4xl font-bold mb-2">Welcome to FitTrack</h1>
                <p className="text-gray-400 mb-8">Your personal fitness journey starts here.</p>
                <button 
                    onClick={onSignIn} 
                    className="bg-white hover:bg-gray-200 text-gray-800 font-bold py-3 px-6 rounded-lg flex items-center justify-center transition-transform transform hover:scale-105"
                >
                    <svg className="w-6 h-6 mr-3" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path><path fill="none" d="M0 0h48v48H0z"></path></svg>
                    Sign in with Google
                </button>
            </div>
        </div>
    );
};


// --- Gemini API Call Helper ---
const callGeminiAPI = async (prompt) => {
    const apiKey = ""; // Leave blank, handled by environment
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    weeklyPlan: {
                        type: "ARRAY",
                        description: "A 5-day workout plan.",
                        items: {
                            type: "OBJECT",
                            properties: {
                                day: { type: "STRING" },
                                focus: { type: "STRING" },
                                exercises: {
                                    type: "ARRAY",
                                    items: {
                                        type: "OBJECT",
                                        properties: {
                                            name: { type: "STRING" },
                                            sets: { type: "STRING" },
                                            reps: { type: "STRING" }
                                        },
                                        required: ["name", "sets", "reps"]
                                    }
                                }
                            },
                            required: ["day", "focus", "exercises"]
                        }
                    }
                },
                required: ["weeklyPlan"]
            }
        }
    };
    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`API call failed with status: ${response.status}`);
    const result = await response.json();
    if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts[0]) {
        return JSON.parse(result.candidates[0].content.parts[0].text);
    } else { throw new Error("Invalid response structure from API."); }
};

// --- Generate Plan & Modal Components ---
const GeneratePlanView = ({ onCancel }) => {
    const [goal, setGoal] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [plan, setPlan] = useState(null);
    const handleGenerate = async (e) => {
        e.preventDefault();
        if (!goal.trim()) return;
        setLoading(true);
        setError(null);
        setPlan(null);
        const prompt = `You are an expert personal trainer. Create a well-balanced, 5-day weekly workout plan for a user whose goal is to "${goal}". For each day, provide a focus (e.g., "Chest & Triceps") and a list of 4-5 exercises. For each exercise, specify the number of sets and reps. Provide the response as a valid JSON object adhering to the provided schema.`;
        try {
            const result = await callGeminiAPI(prompt);
            setPlan(result.weeklyPlan);
        } catch (err) {
            console.error("Gemini API error:", err);
            setError("Sorry, I couldn't generate a plan right now. Please try again later.");
        } finally {
            setLoading(false);
        }
    };
    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
            <h2 className="text-2xl font-bold text-cyan-400 flex items-center"><BrainCircuit className="mr-3" /> AI Workout Plan Generator</h2>
            <p className="text-gray-300">Tell us your fitness goal, and our AI will generate a personalized 5-day workout plan for you.</p>
            <form onSubmit={handleGenerate} className="space-y-4">
                <div>
                    <label htmlFor="goal" className="block text-sm font-medium text-gray-300 mb-1">What is your primary fitness goal?</label>
                    <input id="goal" type="text" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g., build muscle, lose weight, improve endurance" className="w-full bg-gray-700 border-gray-600 rounded-lg p-3 focus:ring-cyan-500 focus:border-cyan-500" required />
                </div>
                <div className="flex items-center justify-end space-x-4">
                    <button type="button" onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg">Back to Dashboard</button>
                    <button type="submit" disabled={loading} className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center">{loading ? <Dumbbell className="w-5 h-5 animate-spin mr-2" /> : '✨ Generate Plan'}</button>
                </div>
            </form>
            {error && (<Modal title="Error" onClose={() => setError(null)}><p className="text-red-400">{error}</p></Modal>)}
            {plan && (<Modal title={`Your Plan for "${goal}"`} onClose={() => setPlan(null)}><WorkoutPlanDisplay plan={plan} /></Modal>)}
        </div>
    );
};
const Modal = ({ title, children, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-full overflow-y-auto">
                <div className="flex justify-between items-center p-4 border-b border-gray-700 sticky top-0 bg-gray-800">
                    <h3 className="text-xl font-bold text-cyan-400">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={24} /></button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
};
const WorkoutPlanDisplay = ({ plan }) => {
    return (
        <div className="space-y-6">
            {plan.map((dayPlan, index) => (
                <div key={index} className="bg-gray-700/50 p-4 rounded-lg">
                    <h4 className="text-lg font-bold text-cyan-400">{dayPlan.day}: <span className="text-yellow-400">{dayPlan.focus}</span></h4>
                    <ul className="mt-2 space-y-2">
                        {dayPlan.exercises.map((exercise, i) => (
                            <li key={i} className="flex justify-between items-center bg-gray-700 p-2 rounded">
                                <span className="font-semibold text-gray-200">{exercise.name}</span>
                                <span className="text-gray-300">{exercise.sets} sets x {exercise.reps} reps</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
};

// --- Dashboard Component ---
const Dashboard = ({ workouts, totalWorkoutsCount, currentWeight, setView, onDeleteWorkout, onEditWorkout }) => {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-800 p-6 rounded-lg shadow-md flex justify-between items-center">
                    <div>
                        <p className="text-gray-400 text-sm">Current Weight</p>
                        <p className="text-3xl font-bold">{currentWeight ? `${currentWeight} lbs` : 'N/A'}</p>
                    </div>
                    <Weight className="w-10 h-10 text-cyan-400" />
                </div>
                <div className="bg-gray-800 p-6 rounded-lg shadow-md flex justify-between items-center">
                    <div>
                        <p className="text-gray-400 text-sm">Total Workouts</p>
                        <p className="text-3xl font-bold">{totalWorkoutsCount}</p>
                    </div>
                    <Dumbbell className="w-10 h-10 text-cyan-400" />
                </div>
            </div>
            <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                <button onClick={() => setView('addWorkout')} className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-transform transform hover:scale-105">
                    <Plus className="mr-2" /> Add Workout
                </button>
                <button onClick={() => setView('logWeight')} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-transform transform hover:scale-105">
                    <Weight className="mr-2" /> Log Weight
                </button>
            </div>
            <div className="bg-gray-800 p-6 rounded-lg shadow-md text-center">
                <h3 className="text-lg font-semibold mb-2 text-cyan-400">Need a Plan?</h3>
                <p className="text-gray-300 mb-4">Let our AI generate a personalized workout plan for you.</p>
                <button onClick={() => setView('generatePlan')} className="bg-gradient-to-r from-purple-500 to-cyan-500 hover:from-purple-600 hover:to-cyan-600 text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center transition-transform transform hover:scale-105 w-full md:w-auto mx-auto">
                    <BrainCircuit className="mr-2" /> ✨ Generate Workout Plan
                </button>
            </div>
            <div>
                <h2 className="text-xl font-bold mb-4 text-cyan-400">Workout History</h2>
                <div className="space-y-4">
                    {workouts.length > 0 ? (
                        workouts.map(day => <WorkoutCard key={day.date} day={day} onDelete={onDeleteWorkout} onEdit={onEditWorkout} />)
                    ) : (
                        <p className="text-gray-400 text-center py-8">No workouts logged yet. Add one to get started!</p>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Daily Workout Card Component ---
const WorkoutCard = ({ day, onDelete, onEdit }) => {
    const formatDate = (dateString) => new Date(dateString + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <div className="bg-gray-800 p-5 rounded-lg shadow-md hover:shadow-cyan-500/20 transition-shadow">
            <h3 className="font-bold text-lg text-cyan-400 mb-4">{formatDate(day.date)}</h3>
            <div className="space-y-4">
                {day.activities.map((activity) => (
                    <div key={activity.id} className="bg-gray-700/50 p-3 rounded-lg">
                        <div className="flex justify-between items-start">
                            {activity.currentWeight && (
                                <div className="flex items-center text-gray-300 text-sm mb-2 font-semibold">
                                    <Weight size={14} className="mr-2"/>
                                    <span>Body Weight: {activity.currentWeight} lbs</span>
                                </div>
                            )}
                            <div className="flex items-center space-x-2 ml-auto">
                                <button onClick={() => onEdit(activity)} className="text-gray-400 hover:text-cyan-400 p-1"><Edit size={18} /></button>
                                <button onClick={() => onDelete(activity.id)} className="text-gray-400 hover:text-red-400 p-1"><Trash2 size={18} /></button>
                            </div>
                        </div>

                        {activity.cardio && activity.cardio.length > 0 && (
                            <div>
                                <h4 className="font-semibold flex items-center text-yellow-400"><Zap size={16} className="mr-2"/>Cardio</h4>
                                <ul className="list-disc list-inside mt-2 text-gray-300 space-y-1 ml-4">
                                    {activity.cardio.map((c, i) => <li key={i}>{c.type}: {c.duration} mins, {c.distance} km</li>)}
                                </ul>
                            </div>
                        )}
                        {activity.weights && activity.weights.length > 0 && (
                             <div className="mt-2">
                                <h4 className="font-semibold flex items-center text-cyan-400"><Dumbbell size={16} className="mr-2"/>Weightlifting</h4>
                                <div className="mt-2 space-y-3">
                                    {activity.weights.map((exercise, i) => (
                                        <div key={i}>
                                            <p className="font-semibold text-gray-200">{exercise.name}</p>
                                            <ul className="text-sm text-gray-400 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1 mt-1 ml-4">
                                                {exercise.sets.map((set, j) => <li key={j} className="flex items-center"><ChevronRight size={12} className="mr-1" />{set.reps} reps @ {set.weight} lbs</li>)}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- Universal Workout Form Component ---
const WorkoutForm = ({ onSave, onCancel, existingWorkout = null }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [currentWeight, setCurrentWeight] = useState('');
    const [cardio, setCardio] = useState([]);
    const [weights, setWeights] = useState([]);

    useEffect(() => {
        if (existingWorkout) {
            setDate(existingWorkout.date || new Date().toISOString().split('T')[0]);
            setCurrentWeight(existingWorkout.currentWeight || '');
            setCardio(existingWorkout.cardio || []);
            setWeights(existingWorkout.weights || []);
        }
    }, [existingWorkout]);

    const addCardio = () => setCardio([...cardio, { type: '', duration: '', distance: '' }]);
    const removeCardio = (index) => setCardio(cardio.filter((_, i) => i !== index));
    const handleCardioChange = (index, field, value) => { const updated = [...cardio]; updated[index][field] = value; setCardio(updated); };

    const addWeightExercise = () => setWeights([...weights, { name: '', sets: [{ reps: '', weight: '' }] }]);
    const removeWeightExercise = (exIndex) => setWeights(weights.filter((_, i) => i !== exIndex));
    const handleExerciseNameChange = (exIndex, value) => { const updated = [...weights]; updated[exIndex].name = value; setWeights(updated); };
    const addSet = (exIndex) => { const updated = [...weights]; updated[exIndex].sets.push({ reps: '', weight: '' }); setWeights(updated); };
    const removeSet = (exIndex, setIndex) => { const updated = [...weights]; updated[exIndex].sets = updated[exIndex].sets.filter((_, i) => i !== setIndex); setWeights(updated); };
    const handleSetChange = (exIndex, setIndex, field, value) => { const updated = [...weights]; updated[exIndex].sets[setIndex][field] = value; setWeights(updated); };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ date, currentWeight, cardio, weights });
    };

    return (
        <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
            <h2 className="text-2xl font-bold text-cyan-400">{existingWorkout ? 'Edit Workout' : 'Add New Workout'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-300 mb-1">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2" required /></div>
                <div><label className="block text-sm font-medium text-gray-300 mb-1">Your Weight (lbs) <span className="text-gray-500">(Optional)</span></label><input type="number" step="0.1" placeholder="e.g., 165.5" value={currentWeight} onChange={(e) => setCurrentWeight(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2" /></div>
            </div>

            <div>
                <h3 className="text-lg font-semibold flex items-center text-yellow-400"><Zap size={18} className="mr-2"/>Cardio</h3>
                {cardio.map((c, i) => (
                    <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-2 p-3 bg-gray-700/50 rounded-lg">
                        <input type="text" placeholder="Activity" value={c.type} onChange={e => handleCardioChange(i, 'type', e.target.value)} className="bg-gray-700 border-gray-600 rounded p-2" required />
                        <input type="number" placeholder="Duration (min)" value={c.duration} onChange={e => handleCardioChange(i, 'duration', e.target.value)} className="bg-gray-700 border-gray-600 rounded p-2" required />
                        <input type="number" placeholder="Distance (km)" value={c.distance} onChange={e => handleCardioChange(i, 'distance', e.target.value)} className="bg-gray-700 border-gray-600 rounded p-2" required />
                        <button type="button" onClick={() => removeCardio(i)} className="text-red-500 hover:text-red-400 flex items-center justify-center p-2 rounded-lg bg-gray-600 hover:bg-gray-500"><Trash2 size={18}/></button>
                    </div>
                ))}
                <button type="button" onClick={addCardio} className="mt-2 text-cyan-400 hover:text-cyan-300 flex items-center"><Plus size={16} className="mr-1"/>Add Cardio Activity</button>
            </div>

            <div>
                <h3 className="text-lg font-semibold flex items-center text-cyan-400"><Dumbbell size={18} className="mr-2"/>Weightlifting</h3>
                <div className="space-y-4">
                    {weights.map((ex, exIndex) => (
                        <div key={exIndex} className="bg-gray-700/50 p-4 rounded-lg space-y-3">
                            <div className="flex items-center justify-between">
                                <input type="text" placeholder="Exercise Name (e.g. Bench Press)" value={ex.name} onChange={e => handleExerciseNameChange(exIndex, e.target.value)} className="flex-grow bg-gray-700 border-gray-600 rounded p-2 font-semibold" required />
                                <button type="button" onClick={() => removeWeightExercise(exIndex)} className="ml-4 text-red-500 hover:text-red-400"><Trash2 size={18}/></button>
                            </div>
                            {ex.sets.map((set, setIndex) => (
                                <div key={setIndex} className="grid grid-cols-4 gap-2 items-center ml-4">
                                    <span className="text-gray-400 font-medium">Set {setIndex + 1}</span>
                                    <input type="number" placeholder="Reps" value={set.reps} onChange={e => handleSetChange(exIndex, setIndex, 'reps', e.target.value)} className="bg-gray-600 border-gray-500 rounded p-2" required />
                                    <input type="number" placeholder="Weight (lbs)" value={set.weight} onChange={e => handleSetChange(exIndex, setIndex, 'weight', e.target.value)} className="bg-gray-600 border-gray-500 rounded p-2" required />
                                    <button type="button" onClick={() => removeSet(exIndex, setIndex)} className="text-red-500 hover:text-red-400"><X size={18}/></button>
                                </div>
                            ))}
                            <button type="button" onClick={() => addSet(exIndex)} className="ml-4 mt-2 text-cyan-400 hover:text-cyan-300 flex items-center text-sm"><Plus size={14} className="mr-1"/>Add Set</button>
                        </div>
                    ))}
                </div>
                <button type="button" onClick={addWeightExercise} className="mt-4 text-cyan-400 hover:text-cyan-300 flex items-center"><Plus size={16} className="mr-1"/>Add Weightlifting Exercise</button>
            </div>

            <div className="flex justify-end space-x-4 pt-4 border-t border-gray-700">
                <button type="button" onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg">Cancel</button>
                <button type="submit" className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-6 rounded-lg">Save Workout</button>
            </div>
        </form>
    );
};

// --- Log Weight Form Component ---
const LogWeightForm = ({ onLogWeight, onCancel }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [weight, setWeight] = useState('');
    const handleSubmit = (e) => { e.preventDefault(); onLogWeight({ date, weight: parseFloat(weight) }); };
    return (
        <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">
            <h2 className="text-2xl font-bold text-cyan-400">Log Your Weight</h2>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2" required />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Weight (lbs)</label>
                <input type="number" step="0.1" placeholder="e.g., 165.5" value={weight} onChange={(e) => setWeight(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2" required />
            </div>
            <div className="flex justify-end space-x-4">
                <button type="button" onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded">Cancel</button>
                <button type="submit" className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-4 rounded">Save Weight</button>
            </div>
        </form>
    );
};
