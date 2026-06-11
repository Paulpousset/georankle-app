-- Table: friends
CREATE TABLE IF NOT EXISTS public.friends (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id1 UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_id2 UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('pending', 'accepted')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id1, user_id2)
);

-- Enable RLS for friends
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

-- Policies for friends
DROP POLICY IF EXISTS "Users can view their friends" ON public.friends;
CREATE POLICY "Users can view their friends" 
ON public.friends FOR SELECT 
USING (auth.uid() = user_id1 OR auth.uid() = user_id2);

DROP POLICY IF EXISTS "Users can insert friendship requests" ON public.friends;
CREATE POLICY "Users can insert friendship requests" 
ON public.friends FOR INSERT 
WITH CHECK (auth.uid() = user_id1);

DROP POLICY IF EXISTS "Users can update their friendship status" ON public.friends;
CREATE POLICY "Users can update their friendship status" 
ON public.friends FOR UPDATE 
USING (auth.uid() = user_id1 OR auth.uid() = user_id2);

DROP POLICY IF EXISTS "Users can delete friends" ON public.friends;
CREATE POLICY "Users can delete friends" 
ON public.friends FOR DELETE 
USING (auth.uid() = user_id1 OR auth.uid() = user_id2);


-- Table: matches (for matchmaking and active games)
CREATE TABLE IF NOT EXISTS public.matches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    player1_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    player2_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    game_mode TEXT CHECK (game_mode IN ('classic', 'streak', 'versus')) NOT NULL,
    is_public BOOLEAN DEFAULT false,
    status TEXT CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled')) DEFAULT 'waiting',
    best_of INTEGER DEFAULT 1,
    p1_rounds_won INTEGER DEFAULT 0,
    p2_rounds_won INTEGER DEFAULT 0,
    p1_current_score INTEGER DEFAULT 0,
    p2_current_score INTEGER DEFAULT 0,
    current_round INTEGER DEFAULT 1,
    p1_finished_round BOOLEAN DEFAULT false,
    p2_finished_round BOOLEAN DEFAULT false,
    game_data JSONB, -- Pre-generated sequence of events/countries to ensure sync
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for matches
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Policies for matches
DROP POLICY IF EXISTS "Anyone can view public or their own matches" ON public.matches;
CREATE POLICY "Anyone can view public or their own matches" 
ON public.matches FOR SELECT 
USING (is_public = true OR auth.uid() = player1_id OR auth.uid() = player2_id);

DROP POLICY IF EXISTS "Users can create matches" ON public.matches;
CREATE POLICY "Users can create matches" 
ON public.matches FOR INSERT 
WITH CHECK (auth.uid() = player1_id OR auth.uid() = player2_id);

DROP POLICY IF EXISTS "Users can update matches they are in" ON public.matches;
DROP POLICY IF EXISTS "Users can update matches they are in or join public ones" ON public.matches;
CREATE POLICY "Users can update matches they are in or join public ones" 
ON public.matches FOR UPDATE 
USING (auth.uid() = player1_id OR auth.uid() = player2_id OR (is_public = true AND status = 'waiting' AND player2_id IS NULL));

-- Enable Realtime for matches table!
-- (Important: Requires superuser or running via Supabase Dashboard UI to publish table)
-- You may need to run this on your project:
-- alter publication supabase_realtime add table public.matches;
