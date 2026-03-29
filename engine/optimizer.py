import psycopg2
from psycopg2.extras import RealDictCursor
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv('DATABASE_URL')

def get_distance_matrix(attractions):
    """
    Creates a distance matrix for the selected attractions based on community data.
    Uses a single batch query for all pairs to improve performance.
    """
    names = [a['place_name'] for a in attractions]
    n = len(names)
    matrix = [[10.0 for _ in range(n)] for _ in range(n)]
    for i in range(n):
        matrix[i][i] = 0.0

    if not DATABASE_URL or n < 2:
        return matrix

    try:
        conn = psycopg2.connect(DATABASE_URL)
        c = conn.cursor()
        
        # Batch query to find all relevant distances between any two places in the list
        q = '''
            SELECT p1.place_name, p2.place_name, AVG(p2.distance_from_prev), AVG(p2.travel_rating)
            FROM places_visited p1
            JOIN places_visited p2 ON p1.trip_id = p2.trip_id 
            WHERE p1.place_name IN %s AND p2.place_name IN %s
              AND ((p2.place_order = p1.place_order + 1) OR (p1.place_order = p2.place_order + 1))
            GROUP BY p1.place_name, p2.place_name
        '''
        c.execute(q, (tuple(names), tuple(names)))
        results = c.fetchall()
        
        # Map indices for quick lookup
        name_to_idx = {name: i for i, name in enumerate(names)}
        
        for row in results:
            p1_name, p2_name, dist, rating = row
            if dist:
                i, j = name_to_idx[p1_name], name_to_idx[p2_name]
                rating = rating if rating else 3.0
                matrix[i][j] = dist / (rating / 3.0)
                # Keep it symmetric if only one direction exists
                if matrix[j][i] == 10.0:
                    matrix[j][i] = matrix[i][j]
                    
        conn.close()
    except Exception as e:
        print(f"Optimizer Batch DB Error: {e}")
        
    return matrix

def solve_tsp_2opt(attractions: list) -> list:
    """
    Solves the TSP for the given attractions using the 2-opt heuristic.
    """
    n = len(attractions)
    if n <= 2:
        return list(attractions)

    matrix = get_distance_matrix(attractions)
    
    # Initial tour: as provided
    tour = list(range(n))
    
    def get_tour_distance(t: list) -> float:
        dist = 0.0
        for i in range(len(t) - 1):
            dist += matrix[t[i]][t[i+1]]
        return dist

    best_distance = get_tour_distance(tour)
    improved = True
    
    # Limit iterations for 2-opt
    max_iters = 50
    iters = 0
    
    while improved and iters < max_iters:
        improved = False
        iters += 1
        for i in range(n):
            for j in range(i + 2, n):
                # Reverse the segment between i+1 and j
                new_tour = tour[:i+1] + tour[i+1:j+1][::-1] + tour[j+1:]
                new_dist = get_tour_distance(new_tour)
                if new_dist < best_distance:
                    best_distance = new_dist
                    tour = new_tour
                    improved = True
    
    return [attractions[idx] for idx in tour]

if __name__ == '__main__':
    # Test stub
    mock_attr = [
        {'place_name': 'A'},
        {'place_name': 'B'},
        {'place_name': 'C'},
        {'place_name': 'D'},
    ]
    # Assuming A-B=1, B-C=1, C-D=1, A-D=10, etc.
    final_route = solve_tsp_2opt(mock_attr)
    print("Optimized Route Order:")
    for a in final_route:
        print(f"- {a['place_name']}")
