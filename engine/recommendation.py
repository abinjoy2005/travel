import os
import sys

# Add parent directory to path to import database
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
import database

def get_db_connection():
    return database.get_db_connection()

def get_top_attractions(destination, user_prefs=None, limit=30):
    """
    Aggregates community data and calculates a "Personalized Match Score" for each attraction.
    """
    conn = get_db_connection()
    c = conn.cursor(cursor_factory=database.RealDictCursor)
    
    # Fetch base stats and aggregate interests/styles for each place
    query = '''
        SELECT 
            p.place_name,
            AVG(p.place_rating) as avg_rating,
            AVG(p.entry_fee) as avg_fee,
            COUNT(p.place_id) as visitation_count,
            STRING_AGG(t.interests, ',') as all_interests,
            STRING_AGG(t.travel_style, ',') as all_styles,
            AVG(t.total_expense / NULLIF(t.trip_duration, 0)) as avg_daily_spend
        FROM places_visited p
        JOIN trip_experiences t ON p.trip_id = t.trip_id
        WHERE LOWER(t.destination) = LOWER(%s)
        GROUP BY p.place_name
    '''
    
    c.execute(query, (destination,))
    rows = c.fetchall()
    
    results = []
    user_interests = set(user_prefs.get('interests', [])) if user_prefs else set()
    user_style = user_prefs.get('style', 'moderate') if user_prefs else 'moderate'
    user_budget_daily = (user_prefs.get('budget', 5000) / user_prefs.get('duration', 1)) if user_prefs else 1000

    for row in rows:
        d = dict(row)
        
        # Calculate Match Score (0.0 to 1.0)
        score = 0.5 # Base score
        
        # 1. Interest Match
        place_interests = set(d['all_interests'].split(',')) if d['all_interests'] else set()
        if user_interests and place_interests:
            overlap = user_interests.intersection(place_interests)
            score += 0.3 * (len(overlap) / len(user_interests))
            
        # 2. Style Match
        place_styles = d['all_styles'].split(',') if d['all_styles'] else []
        if user_style in place_styles:
            score += 0.1
            
        # 3. Budget Alignment
        if d['avg_daily_spend']:
            # How close is the place's typical trip budget to the user's budget?
            budget_ratio = min(d['avg_daily_spend'], user_budget_daily) / max(d['avg_daily_spend'], user_budget_daily)
            score += 0.1 * budget_ratio

        d['match_score'] = min(score, 1.0)
        
        # Fetch up to 3 recent reviews
        reviews_query = "SELECT experience_review FROM places_visited WHERE place_name = %s AND experience_review IS NOT NULL AND experience_review != '' ORDER BY place_id DESC LIMIT 3"
        c.execute(reviews_query, (d['place_name'],))
        reviews = c.fetchall()
        d['reviews'] = [r['experience_review'] for r in reviews]
        
        results.append(d)
        
    conn.close()
    
    # Sort by match score and rating, handling potential None values
    results.sort(key=lambda x: (x.get('match_score', 0.0) or 0.0, x.get('avg_rating', 0.0) or 0.0), reverse=True)
    return results[:limit]

def get_travel_stats(destination):
    """
    Calculates average travel costs and ratings between places for a destination.
    """
    conn = get_db_connection()
    c = conn.cursor(cursor_factory=database.RealDictCursor)
    
    query = '''
        SELECT 
            travel_method,
            AVG(travel_cost) as avg_cost,
            AVG(travel_rating) as avg_rating,
            AVG(distance_from_prev) as avg_distance,
            COUNT(*) as frequency
        FROM places_visited p
        JOIN trip_experiences t ON p.trip_id = t.trip_id
        WHERE LOWER(t.destination) = LOWER(%s) AND travel_method IS NOT NULL
        GROUP BY travel_method
    '''
    
    c.execute(query, (destination,))
    rows = c.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]

def get_best_stay(destination, user_prefs=None):
    """
    Finds the best-rated stay for a destination from community data.
    """
    conn = get_db_connection()
    c = conn.cursor(cursor_factory=database.RealDictCursor)
    
    query = '''
        SELECT 
            stay_name,
            AVG(stay_rating) as avg_rating,
            AVG(stay_price) as avg_price,
            COUNT(*) as frequency
        FROM trip_experiences
        WHERE LOWER(destination) = LOWER(%s) AND stay_name IS NOT NULL AND stay_name != ''
        GROUP BY stay_name
        ORDER BY avg_rating DESC, frequency DESC
        LIMIT 1
    '''
    
    c.execute(query, (destination,))
    row = c.fetchone()
    conn.close()
    
    if row:
        return dict(row)
    return None

def get_best_intercity_travel(origin, destination):
    """
    Finds the most optimal intercity travel method and cost between two cities.
    """
    conn = get_db_connection()
    c = conn.cursor(cursor_factory=database.RealDictCursor)
    
    # We look for the first travel entry in trips between these cities
    query = '''
        SELECT 
            p.travel_method,
            AVG(p.travel_cost) as avg_cost,
            AVG(p.travel_rating) as avg_rating,
            COUNT(*) as frequency
        FROM places_visited p
        JOIN trip_experiences t ON p.trip_id = t.trip_id
        WHERE LOWER(t.origin) = LOWER(%s) AND LOWER(t.destination) = LOWER(%s)
          AND p.place_order = 0 AND p.travel_method IS NOT NULL
        GROUP BY p.travel_method
        ORDER BY avg_rating DESC, frequency DESC
        LIMIT 1
    '''
    
    c.execute(query, (origin, destination))
    row = c.fetchone()
    conn.close()
    
    if row:
        return dict(row)
    return None

def get_avg_transport_cost(destination, method):
    """
    Calculates average travel cost for a specific method within a destination.
    """
    conn = get_db_connection()
    c = conn.cursor(cursor_factory=database.RealDictCursor)
    
    query = '''
        SELECT AVG(p.travel_cost) as avg_cost
        FROM places_visited p
        JOIN trip_experiences t ON p.trip_id = t.trip_id
        WHERE LOWER(t.destination) = LOWER(%s) AND LOWER(p.travel_method) = LOWER(%s)
          AND p.travel_cost > 0 AND p.place_order > 0
    '''
    
    c.execute(query, (destination, method))
    row = c.fetchone()
    conn.close()
    
    if row and row['avg_cost']:
        return float(row['avg_cost'])
    return 100.0 # Default fallback cost

def get_avg_distance(place1, place2):
    """
    Calculates average distance between two places based on community logs.
    """
    conn = get_db_connection()
    c = conn.cursor(cursor_factory=database.RealDictCursor)
    
    query = '''
        SELECT AVG(p2.distance_from_prev) as avg_dist
        FROM places_visited p1
        JOIN places_visited p2 ON p1.trip_id = p2.trip_id 
        WHERE (p1.place_name = %s AND p2.place_name = %s AND p2.place_order = p1.place_order + 1)
           OR (p1.place_name = %s AND p2.place_name = %s AND p1.place_order = p2.place_order + 1)
    '''
    
    c.execute(query, (place1, place2, place2, place1))
    row = c.fetchone()
    conn.close()
    
    if row and row['avg_dist']:
        return round(float(row['avg_dist']), 1)
    return 5.0 # Default fallback distance

if __name__ == '__main__':
    # Test with mock data if needed
    stats = get_top_attractions('Munnar')
    print("Top Attractions in Munnar:")
    for s in stats:
        print(f"- {s['place_name']}: {s['avg_rating']} stars (Fee: ₹{s['avg_fee']})")
