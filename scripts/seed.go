// seed.go — heavy-data feed script for visual/load testing
// Usage:
//   go run scripts/seed.go -base http://localhost -email admin@example.com -password yourpass -products 200 -comments 3
//
// Flags:
//   -base       Base URL of the app (default: http://localhost)
//   -email      Admin account email
//   -password   Admin account password
//   -products   Number of products to create (default: 100)
//   -comments   Comments per product (default: 2)
//   -workers    Concurrent goroutines (default: 10)
//   -dry        Print what would be created without sending requests

package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

// ── Config ────────────────────────────────────────────────────────────────────

var (
	base     = flag.String("base", "http://localhost", "Base URL (no trailing slash)")
	email    = flag.String("email", "", "Admin email (required)")
	password = flag.String("password", "", "Admin password (required)")
	nProd    = flag.Int("products", 100, "Number of products to create")
	nComm    = flag.Int("comments", 2, "Comments per product")
	workers  = flag.Int("workers", 10, "Concurrent goroutines")
	dry      = flag.Bool("dry", false, "Dry run — print without sending")
	insecure = flag.Bool("insecure", false, "Skip TLS certificate verification")
)

// ── Sample data ───────────────────────────────────────────────────────────────

var firstNames = []string{
	"James", "Emma", "Liam", "Olivia", "Noah", "Ava", "William", "Sophia",
	"Oliver", "Isabella", "Elijah", "Mia", "Lucas", "Charlotte", "Mason",
	"Amelia", "Logan", "Harper", "Ethan", "Evelyn", "Aiden", "Abigail",
	"Jackson", "Emily", "Sebastian", "Ella", "Carter", "Elizabeth", "Owen",
	"Camila", "Ryan", "Luna", "Nathan", "Sofia", "Caleb", "Avery",
}

var lastNames = []string{
	"Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
	"Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
	"Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
	"Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
	"Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
}

var descriptions = []string{
	"Custom embroidery on 3 shirts — logos attached",
	"Bulk order: 50 tote bags with screen print",
	"Wedding party matching tees, 12 pieces",
	"Company uniform set — polo shirts x20",
	"Sports jersey with player numbers and names",
	"Baby shower favour bags — pastel theme",
	"Graduation hoodies — class of 2025",
	"Festival merchandise — 200 mixed items",
	"Corporate gift set with branded packaging",
	"Personalised aprons for restaurant staff",
	"School PE kit — 30 pupils",
	"Charity run tees — 500 pieces",
	"Birthday party matching outfits",
	"Promotional caps with logo embroidery",
	"Halloween costume lot — 15 units",
	"Hen party sashes and tees",
	"Stag do custom shirts",
	"Gym wear with sublimation print",
	"Workwear hi-vis vests — 8 units",
	"Christmas jumper order — 25 pieces",
	"Retro band merch reprint",
	"Tech company onboarding kits",
	"Football team strips — full squad",
	"Market stall display banners",
	"Café branded staff uniforms",
}

var comments = []string{
	"Artwork approved — proceeding to print.",
	"Colour proof sent to customer, awaiting sign-off.",
	"Fabric arrived, cutting starts tomorrow.",
	"Customer requested a size swap on 3 units.",
	"Screen ready, production starts Monday.",
	"Quality check passed — packaging underway.",
	"Slight delay on thread delivery, ETA +2 days.",
	"Sample dispatched via next-day courier.",
	"Logo file updated to vector, now production-ready.",
	"Customer confirmed delivery address change.",
	"Rush fee applied — customer agreed.",
	"Pre-production sample approved by customer.",
	"Bulk discount applied as agreed.",
	"Pantone colours matched successfully.",
	"Final invoice sent — awaiting payment.",
	"Order split into two batches for efficiency.",
	"Special packaging requested — sourcing now.",
	"Heat transfer vinyl ordered, 3-day lead time.",
	"Embroidery hoop size adjusted for design.",
	"Dispatch confirmed — tracking number shared.",
}

var statuses = []string{"yet_to_start", "working", "review", "done"}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

var client *http.Client

func initClient() {
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: *insecure},
	}
	client = &http.Client{Timeout: 15 * time.Second, Transport: tr}
}

func post(url, token string, body any) (*http.Response, error) {
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", url, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return client.Do(req)
}

func patch(url, token string, body any) (*http.Response, error) {
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest("PATCH", url, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	return client.Do(req)
}

// ── Main ─────────────────────────────────────────────────────────────────────

func main() {
	flag.Parse()
	initClient()
	if *email == "" || *password == "" {
		log.Fatal("Both -email and -password are required")
	}

	rand.Seed(time.Now().UnixNano())

	fmt.Printf("Seeder config:\n  Base:     %s\n  Products: %d\n  Comments: %d/product\n  Workers:  %d\n  Dry run:  %v\n\n",
		*base, *nProd, *nComm, *workers, *dry)

	if *dry {
		fmt.Println("=== DRY RUN — no requests will be sent ===")
		for i := 1; i <= *nProd; i++ {
			name, pid, status, desc := randomProduct(i)
			fmt.Printf("[%03d] %s | %s | %-12s | %s\n", i, pid, name, status, trunc(desc, 40))
		}
		return
	}

	// ── Login ─────────────────────────────────────────────────────────────────
	fmt.Print("Logging in... ")
	resp, err := post(*base+"/api/auth/login", "", map[string]string{
		"email":    *email,
		"password": *password,
	})
	if err != nil {
		log.Fatalf("login request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		log.Fatalf("login failed: HTTP %d", resp.StatusCode)
	}
	var loginResp struct {
		AccessToken string `json:"access_token"`
	}
	json.NewDecoder(resp.Body).Decode(&loginResp)
	token := loginResp.AccessToken
	if token == "" {
		log.Fatal("no access_token in login response")
	}
	fmt.Println("OK")

	// ── Seed products ─────────────────────────────────────────────────────────
	type job struct {
		index int
	}

	jobs := make(chan job, *nProd)
	for i := 1; i <= *nProd; i++ {
		jobs <- job{i}
	}
	close(jobs)

	var (
		created  int64
		failed   int64
		wg       sync.WaitGroup
		mu       sync.Mutex
		failures []string
	)

	start := time.Now()
	fmt.Printf("Creating %d products with %d workers...\n", *nProd, *workers)

	for w := 0; w < *workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobs {
				name, pid, status, desc := randomProduct(j.index)

				// Create product
				r, err := post(*base+"/api/products", token, map[string]any{
					"product_id":    pid,
					"customer_name": name,
					"customer_phone": randomPhone(),
					"description":  desc,
					"delivery_at":  randomDelivery(),
				})
				if err != nil || r.StatusCode != http.StatusCreated {
					code := 0
					if r != nil {
						code = r.StatusCode
					}
					atomic.AddInt64(&failed, 1)
					mu.Lock()
					failures = append(failures, fmt.Sprintf("  product #%d: HTTP %d err=%v", j.index, code, err))
					mu.Unlock()
					if r != nil {
						r.Body.Close()
					}
					continue
				}
				var prodResp struct {
					Data struct {
						ID uint `json:"id"`
					} `json:"data"`
				}
				json.NewDecoder(r.Body).Decode(&prodResp)
				r.Body.Close()
				prodID := prodResp.Data.ID

				// Update status (skip yet_to_start since that's the default)
				if status != "yet_to_start" && prodID > 0 {
					sr, _ := patch(
						fmt.Sprintf("%s/api/products/%d/status", *base, prodID),
						token,
						map[string]string{"status": status},
					)
					if sr != nil {
						sr.Body.Close()
					}
				}

				// Add comments
				for c := 0; c < *nComm && prodID > 0; c++ {
					cr, _ := post(
						fmt.Sprintf("%s/api/products/%d/comments", *base, prodID),
						token,
						map[string]string{"message": randomComment()},
					)
					if cr != nil {
						cr.Body.Close()
					}
					time.Sleep(20 * time.Millisecond) // small pause between comments
				}

				n := atomic.AddInt64(&created, 1)
				if n%10 == 0 || int(n) == *nProd {
					elapsed := time.Since(start).Round(time.Millisecond)
					fmt.Printf("  %d/%d created (%s)\n", n, *nProd, elapsed)
				}
			}
		}()
	}

	wg.Wait()
	elapsed := time.Since(start).Round(time.Millisecond)

	fmt.Printf("\nDone in %s\n", elapsed)
	fmt.Printf("  Created: %d\n", created)
	fmt.Printf("  Failed:  %d\n", failed)
	if len(failures) > 0 {
		fmt.Println("\nFailures:")
		for _, f := range failures {
			fmt.Println(f)
		}
	}
}

// ── Generators ────────────────────────────────────────────────────────────────

func randomProduct(i int) (name, pid, status, desc string) {
	first := firstNames[rand.Intn(len(firstNames))]
	last := lastNames[rand.Intn(len(lastNames))]
	name = first + " " + last
	pid = fmt.Sprintf("ORD-%05d", i)
	status = statuses[rand.Intn(len(statuses))]
	desc = descriptions[rand.Intn(len(descriptions))]
	return
}

func randomPhone() string {
	return fmt.Sprintf("+44 7%d %06d", 100+rand.Intn(900), rand.Intn(1000000))
}

func randomDelivery() string {
	days := rand.Intn(60) + 1
	return time.Now().AddDate(0, 0, days).Format(time.RFC3339)
}

func randomComment() string {
	return comments[rand.Intn(len(comments))]
}

func trunc(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
