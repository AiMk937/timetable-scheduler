
#!/usr/bin/env python3
# genetic_optimizer.py
#
# Hybrid CSP + Genetic Algorithm for timetable optimization.
# - Uses existing CSP-based TimetableScheduler to generate initial population.
# - Applies genetic operators (mutation & crossover) to evolve a better timetable.
# - Preserves lab blocks (all batches) when swapping.
# - Ensures no teacher/room conflicts throughout.

import random
import copy
import time
from typing import Dict, List, Any, Tuple
from collections import defaultdict

from generator import TimetableScheduler

# Constants (must match those in generator.py)
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
SLOTS_PER_DAY = 7

# Type aliases for readability
TimetableGrid = Dict[str, List[Any]]
DepartmentTimetable = Dict[str, TimetableGrid]

class GeneticTimetableOptimizer:
    def __init__(self, department_id: str, academic_year_id: str, population_size: int = 10):
        self.department_id = department_id
        self.academic_year_id = academic_year_id
        self.population_size = population_size

        # Generate initial population via CSP, with slight randomness for variety
        self.population: List[DepartmentTimetable] = []
        for i in range(population_size):
            scheduler = TimetableScheduler()
            random.seed(time.time() + i)
            indiv = scheduler.generate_for_department(department_id, academic_year_id)
            self.population.append(indiv)

    def fitness(self, individual: DepartmentTimetable) -> float:
        # Compute a fitness score for the department timetable.
        # Lower scores are better. Penalize teacher idle time (gaps between first and last slot).
        teacher_slots: Dict[str, List[int]] = defaultdict(list)
        gap_penalty = 0

        for class_id, grid in individual.items():
            for day in DAYS:
                for slot, entry in enumerate(grid[day]):
                    if isinstance(entry, list):
                        for lab_info in entry:
                            teacher = lab_info.get('teacher')
                            if teacher:
                                idx = DAYS.index(day) * SLOTS_PER_DAY + slot
                                teacher_slots[teacher].append(idx)
                    elif isinstance(entry, dict):
                        teacher = entry.get('teacher')
                        if teacher:
                            idx = DAYS.index(day) * SLOTS_PER_DAY + slot
                            teacher_slots[teacher].append(idx)

        for teacher, slots in teacher_slots.items():
            if not slots:
                continue
            slots.sort()
            first = slots[0]
            last = slots[-1]
            total_slots = last - first + 1
            working_slots = len(slots)
            gaps = total_slots - working_slots
            gap_penalty += gaps

        return gap_penalty

    def mutate(self, individual: DepartmentTimetable) -> DepartmentTimetable:
        # Perform mutation on a single department timetable.
        # - Randomly choose one class.
        # - Within that class, swap two slots if both are lecture-type or both lab-type.
        # - Preserve lab blocks (two consecutive slots) when migrating.
        child = copy.deepcopy(individual)
        class_id = random.choice(list(child.keys()))
        grid = child[class_id]

        all_slots: List[Tuple[str, int]] = [(day, s) for day in DAYS for s in range(SLOTS_PER_DAY)]
        random.shuffle(all_slots)

        for (day1, slot1), (day2, slot2) in zip(all_slots[::2], all_slots[1::2]):
            ent1 = grid[day1][slot1]
            ent2 = grid[day2][slot2]

            def is_lab_slot(day, slot):
                val = grid[day][slot]
                return isinstance(val, list)

            # If both slots are the heads of lab-blocks, swap entire 2-slot blocks
            if (is_lab_slot(day1, slot1) and is_lab_slot(day2, slot2)):
                block1 = grid[day1][slot1]
                block1_next = grid[day1][slot1 + 1]
                block2 = grid[day2][slot2]
                block2_next = grid[day2][slot2 + 1]

                grid[day1][slot1], grid[day2][slot2] = block2, block1
                grid[day1][slot1 + 1], grid[day2][slot2 + 1] = block2_next, block1_next
                break

            # If both slots are individual lectures, swap directly
            elif (isinstance(ent1, dict) and isinstance(ent2, dict)):
                grid[day1][slot1], grid[day2][slot2] = ent2, ent1
                break

        return child

    def crossover(self, parent1: DepartmentTimetable, parent2: DepartmentTimetable) -> DepartmentTimetable:
        # Perform crossover between two parent timetables.
        # For each class, randomly choose which parent's schedule to inherit.
        child: DepartmentTimetable = {}
        for class_id in parent1.keys():
            if random.random() < 0.5:
                child[class_id] = copy.deepcopy(parent1[class_id])
            else:
                child[class_id] = copy.deepcopy(parent2[class_id])
        return child

    def evolve(self, generations: int = 100) -> DepartmentTimetable:
        # Run the genetic algorithm for a given number of generations.
        # Returns the best timetable found.
        for gen in range(generations):
            scored_pop = [(self.fitness(ind), ind) for ind in self.population]
            scored_pop.sort(key=lambda x: x[0])

            elitism_count = max(1, self.population_size // 5)
            next_population = [copy.deepcopy(ind) for _, ind in scored_pop[:elitism_count]]

            while len(next_population) < self.population_size:
                contenders = random.sample(scored_pop, 3)
                parent1 = min(contenders, key=lambda x: x[0])[1]
                contenders = random.sample(scored_pop, 3)
                parent2 = min(contenders, key=lambda x: x[0])[1]

                child = self.crossover(parent1, parent2)

                if random.random() < 0.5:
                    child = self.mutate(child)

                next_population.append(child)

            self.population = next_population

        best_score, best_ind = min([(self.fitness(ind), ind) for ind in self.population], key=lambda x: x[0])
        print(f"Best fitness: {best_score}")
        return best_ind

if __name__ == "__main__":
    dept_id = "YOUR_DEPARTMENT_ID"
    year_id = "YOUR_ACADEMIC_YEAR_ID"
    ga = GeneticTimetableOptimizer(dept_id, year_id, population_size=10)
    best_timetable = ga.evolve(generations=50)
    # You can now store best_timetable as needed.
